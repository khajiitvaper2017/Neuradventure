import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import * as db from "../core/db.js"
import {
  CreateStoryRequestSchema,
  MainCharacterStateSchema,
  MainCharacterStateStoredSchema,
  NPCStateStoredSchema,
  UpdateStoryRequestSchema,
  UpdateStoryStateRequestSchema,
  WorldStateStoredSchema,
} from "../core/models.js"
import { createNewStory } from "../game/index.js"
import {
  characterToTavernCard,
  tavernCardToCharacter,
  storyToTavernJSONL,
  storyToPlaintext,
  detectImportFormat,
  parseTavernJSONL,
  type TavernCardV2,
} from "../utils/converters/tavern.js"
import { normalizeStoryModules, StoryModulesSchema } from "../schemas/story-modules.js"

const stories = new Hono()

function hashString(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}

function parseStoryState(row: db.StoryRow) {
  const world = WorldStateStoredSchema.parse(JSON.parse(row.world_state_json))
  const initialWorld = WorldStateStoredSchema.parse(JSON.parse(row.initial_world_state_json ?? row.world_state_json))
  const parsedCharacter = MainCharacterStateStoredSchema.parse(JSON.parse(row.character_state_json))
  const character =
    parsedCharacter.current_location.trim().toLowerCase() === world.current_scene.trim().toLowerCase()
      ? parsedCharacter
      : { ...parsedCharacter, current_location: world.current_scene }
  const npcs = (JSON.parse(row.npc_states_json) as unknown[]).map((n) => NPCStateStoredSchema.parse(n))
  return { character, world, initialWorld, npcs }
}

function parseStoryModules(row: db.StoryRow) {
  const defaults = db.getSettings().storyDefaults
  try {
    const raw = row.story_modules_json ? JSON.parse(row.story_modules_json) : null
    return normalizeStoryModules(raw, defaults)
  } catch {
    return defaults
  }
}

const ImportTurnSchema = z.object({
  player_input: z.string().min(1),
  narrative_text: z.string().min(1),
  action_mode: z.string().optional(),
})

const ImportStorySchema = z.object({
  title: z.string(),
  opening_scenario: z.string(),
  character: MainCharacterStateStoredSchema,
  world: WorldStateStoredSchema,
  npcs: z.array(NPCStateStoredSchema).default([]),
  story_modules: StoryModulesSchema.optional(),
  author_note: z.string().optional(),
  author_note_depth: z.number().int().min(0).max(100).optional(),
  turns: z.array(ImportTurnSchema).optional(),
})

stories.get("/", (c) => {
  const rows = db.listStories()
  return c.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      turn_count: r.turn_count,
      character_name: MainCharacterStateStoredSchema.parse(JSON.parse(r.character_state_json)).name,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
  )
})

stories.get("/characters", (c) => {
  const characters = db.listCharacters()
  const storyRefs = db.listStoryCharacterRefs()
  const groups = new Map<
    number,
    {
      id: number
      character: Omit<ReturnType<typeof MainCharacterStateSchema.parse>, "inventory">
      stories: { id: number; title: string; updated_at: string }[]
    }
  >()

  for (const row of characters) {
    const parsed = MainCharacterStateStoredSchema.safeParse(JSON.parse(row.state_json))
    if (!parsed.success) continue
    const { inventory: _inventory, ...base } = parsed.data
    void _inventory
    groups.set(row.id, { id: row.id, character: base, stories: [] })
  }

  for (const story of storyRefs) {
    if (!story.character_id) continue
    const entry = groups.get(story.character_id)
    if (entry) {
      entry.stories.push({ id: story.id, title: story.title, updated_at: story.updated_at })
    }
  }

  return c.json(Array.from(groups.values()))
})

stories.get("/npcs", (c) => {
  const rows = db.listStoriesWithNpcs()
  const groups = new Map<
    string,
    {
      key: string
      npc: Omit<ReturnType<typeof NPCStateStoredSchema.parse>, "inventory">
      stories: { id: number; title: string; updated_at: string }[]
    }
  >()

  for (const row of rows) {
    let raw: unknown
    try {
      raw = JSON.parse(row.npc_states_json)
    } catch {
      continue
    }
    if (!Array.isArray(raw)) continue
    for (const entry of raw) {
      const parsed = NPCStateStoredSchema.safeParse(entry)
      if (!parsed.success) continue
      const { inventory: _inventory, ...base } = parsed.data
      void _inventory
      const keySource = JSON.stringify(base)
      let group = groups.get(keySource)
      if (!group) {
        group = {
          key: `npc_${hashString(keySource)}`,
          npc: base,
          stories: [],
        }
        groups.set(keySource, group)
      }
      group.stories.push({ id: row.id, title: row.title, updated_at: row.updated_at })
    }
  }

  return c.json(Array.from(groups.values()))
})

stories.get("/:id", (c) => {
  const id = Number(c.req.param("id"))
  const row = db.getStory(id)
  if (!row) return c.json({ error: "Story not found" }, 404)
  const { character, world, initialWorld, npcs } = parseStoryState(row)
  const storyModules = parseStoryModules(row)
  return c.json({
    id: row.id,
    title: row.title,
    opening_scenario: row.opening_scenario,
    author_note: row.author_note ?? "",
    author_note_depth: row.author_note_depth ?? 4,
    story_modules: storyModules,
    character,
    world,
    initial_world: initialWorld,
    npcs,
    created_at: row.created_at,
    updated_at: row.updated_at,
  })
})

stories.post("/", zValidator("json", CreateStoryRequestSchema), async (c) => {
  const body = c.req.valid("json")

  let character
  let characterId: number | null = null
  if (body.character_id) {
    const charRow = db.getCharacter(body.character_id)
    if (!charRow) return c.json({ error: "Character not found" }, 404)
    const base = MainCharacterStateStoredSchema.parse(JSON.parse(charRow.state_json))
    character = { ...base, inventory: [] }
    characterId = charRow.id
  } else if (body.character_data) {
    const parsed = MainCharacterStateStoredSchema.parse(body.character_data)
    const { inventory: _inventory, ...base } = parsed
    void _inventory
    characterId = db.createCharacter(base)
    character = parsed
  } else {
    return c.json({ error: "Provide character_id or character_data" }, 400)
  }

  const id = createNewStory(
    body.title,
    body.opening_scenario,
    character,
    body.npcs ?? [],
    body.starting_scene,
    body.starting_date,
    body.starting_time,
    body.story_modules ?? db.getSettings().storyDefaults,
    characterId,
  )
  return c.json({ id }, 201)
})

stories.put("/:id", zValidator("json", UpdateStoryRequestSchema), (c) => {
  const id = Number(c.req.param("id"))
  const row = db.getStory(id)
  if (!row) return c.json({ error: "Story not found" }, 404)
  const body = c.req.valid("json")
  db.updateStoryMeta(id, {
    title: body.title,
    opening_scenario: body.opening_scenario,
    author_note: body.author_note,
    author_note_depth: body.author_note_depth,
    story_modules: body.story_modules,
  })
  return c.json({ ok: true })
})

stories.put("/:id/state", zValidator("json", UpdateStoryStateRequestSchema), (c) => {
  const id = Number(c.req.param("id"))
  const row = db.getStory(id)
  if (!row) return c.json({ error: "Story not found" }, 404)
  const body = c.req.valid("json")
  const currentCharacter = MainCharacterStateStoredSchema.parse(JSON.parse(row.character_state_json))
  const { world: currentWorld, npcs: currentNpcs } = parseStoryState(row)
  const nextCharacter = body.character ? MainCharacterStateStoredSchema.parse(body.character) : currentCharacter
  const nextNpcs = body.npcs ? body.npcs.map((n) => NPCStateStoredSchema.parse(n)) : currentNpcs
  const nextWorld = body.world
    ? { ...currentWorld, ...(body.world.memory !== undefined ? { memory: body.world.memory } : {}) }
    : currentWorld
  db.updateStory(id, nextCharacter, nextWorld, nextNpcs)
  return c.json({ character: nextCharacter, world: nextWorld, npcs: nextNpcs })
})

stories.delete("/:id", (c) => {
  const id = Number(c.req.param("id"))
  db.deleteStory(id)
  return c.json({ ok: true })
})

// ─── Story Export (multiple formats) ──────────────────────────────────────────

stories.get("/:id/export", (c) => {
  const id = Number(c.req.param("id"))
  const format = (c.req.query("format") || "neuradventure") as string
  const row = db.getStory(id)
  if (!row) return c.json({ error: "Story not found" }, 404)
  const { character, world, npcs } = parseStoryState(row)
  const storyModules = parseStoryModules(row)
  const turns = db.getTurnsForStory(id)

  if (format === "tavern") {
    const jsonl = storyToTavernJSONL(row.title, row.opening_scenario, character.name, turns)
    return new Response(jsonl, {
      headers: {
        "Content-Type": "application/x-jsonlines",
        "Content-Disposition": `attachment; filename="story-${id}.jsonl"`,
      },
    })
  }

  if (format === "plaintext") {
    const text = storyToPlaintext(row.title, row.opening_scenario, turns)
    return new Response(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="story-${id}.txt"`,
      },
    })
  }

  // Default: neuradventure format
  const data = JSON.stringify(
    {
      title: row.title,
      opening_scenario: row.opening_scenario,
      author_note: row.author_note ?? "",
      author_note_depth: row.author_note_depth ?? 4,
      story_modules: storyModules,
      character,
      world,
      npcs,
      turns: turns.map((t) => ({
        turn_number: t.turn_number,
        player_input: t.player_input,
        narrative_text: t.narrative_text,
        created_at: t.created_at,
      })),
      exported_at: new Date().toISOString(),
    },
    null,
    2,
  )
  return new Response(data, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="story-${id}.json"`,
    },
  })
})

// ─── Story Import ─────────────────────────────────────────────────────────────

stories.post("/import", async (c) => {
  const raw = await c.req.text()
  let data: unknown = raw
  try {
    data = JSON.parse(raw)
  } catch {
    // keep raw text for JSONL detection
  }

  const format = detectImportFormat(data)

  if (format === "tavern-card") {
    return c.json({ error: "Character card detected. Use character import instead." }, 400)
  }

  if (format === "tavern-jsonl") {
    try {
      const parsed = parseTavernJSONL(typeof data === "string" ? data : raw)
      const character = MainCharacterStateStoredSchema.parse({ name: parsed.userName })
      const { inventory: _inventory, ...base } = character
      void _inventory
      const characterId = db.createCharacter(base)
      const title =
        parsed.characterName && parsed.characterName !== "Narrator"
          ? `Imported Chat with ${parsed.characterName}`
          : "Imported Chat"
      const storyId = createNewStory(
        title,
        parsed.openingScenario,
        character,
        [],
        undefined,
        undefined,
        undefined,
        db.getSettings().storyDefaults,
        characterId,
      )
      const storyRow = db.getStory(storyId)
      if (storyRow) {
        const snapshot = parseStoryState(storyRow)
        parsed.turns.forEach((turn, index) => {
          db.createTurn(
            storyId,
            index + 1,
            "do",
            null,
            turn.player_input,
            turn.narrative_text,
            snapshot.character,
            snapshot.world,
            snapshot.npcs,
          )
        })
      }
      return c.json({ id: storyId }, 201)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid JSONL format"
      return c.json({ error: message }, 400)
    }
  }

  if (format === "neuradventure") {
    const parsed = ImportStorySchema.parse(data)
    const { inventory: _inventory, ...base } = parsed.character
    void _inventory
    const characterId = db.createCharacter(base)
    const id = db.createStory(
      parsed.title,
      parsed.opening_scenario,
      parsed.character,
      parsed.world,
      parsed.npcs,
      parsed.story_modules ?? db.getSettings().storyDefaults,
      characterId,
      parsed.author_note ?? "",
      parsed.author_note_depth ?? 4,
    )
    if (parsed.author_note !== undefined || parsed.author_note_depth !== undefined) {
      db.updateStoryMeta(id, {
        author_note: parsed.author_note,
        author_note_depth: parsed.author_note_depth,
      })
    }
    if (parsed.turns && parsed.turns.length > 0) {
      const row = db.getStory(id)
      if (row) {
        const snapshot = parseStoryState(row)
        parsed.turns.forEach((turn, index) => {
          db.createTurn(
            id,
            index + 1,
            turn.action_mode ?? "do",
            null,
            turn.player_input,
            turn.narrative_text,
            snapshot.character,
            snapshot.world,
            snapshot.npcs,
          )
        })
      }
    }
    return c.json({ id }, 201)
  }

  return c.json({ error: "Unrecognized import format. Expected Neuradventure JSON or SillyTavern JSONL." }, 400)
})

// ─── Character Export ─────────────────────────────────────────────────────────

stories.get("/characters/:id/export", (c) => {
  const charId = Number(c.req.param("id"))
  const format = (c.req.query("format") || "neuradventure") as string
  const charRow = db.getCharacter(charId)
  if (!charRow) return c.json({ error: "Character not found" }, 404)

  const parsed = MainCharacterStateStoredSchema.parse(JSON.parse(charRow.state_json))

  if (format === "tavern-card") {
    const card = characterToTavernCard(parsed)
    const data = JSON.stringify(card, null, 2)
    return new Response(data, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="character-${parsed.name.replace(/\s+/g, "_")}.json"`,
      },
    })
  }

  // Default: neuradventure
  const { inventory: _inventory, ...base } = parsed
  void _inventory
  const data = JSON.stringify(base, null, 2)
  return new Response(data, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="character-${parsed.name.replace(/\s+/g, "_")}.json"`,
    },
  })
})

// ─── Character Import ─────────────────────────────────────────────────────────

stories.post("/characters/import", async (c) => {
  const body = await c.req.json()
  const format = detectImportFormat(body)

  if (format === "tavern-card") {
    const result = tavernCardToCharacter(body as TavernCardV2)
    if (!result.needs_review) {
      const characterId = db.createCharacter(result.character)
      return c.json({ id: characterId, character: result.character, needs_review: false }, 201)
    }
    return c.json({
      character: result.character,
      needs_review: true,
      source: result.source,
      source_text: result.source_text,
    })
  }

  const parsed = MainCharacterStateStoredSchema.safeParse(body)
  if (parsed.success) {
    const { inventory: _inventory, ...base } = parsed.data
    void _inventory
    const characterId = db.createCharacter(base)
    return c.json({ id: characterId, character: base, needs_review: false }, 201)
  }

  return c.json({ error: "Unrecognized import format. Expected TavernCardV2 or Neuradventure character." }, 400)
})

export default stories
