import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import * as db from "../db.js"
import {
  CreateStoryRequestSchema,
  MainCharacterStateSchema,
  MainCharacterStateStoredSchema,
  NPCStateStoredSchema,
  UpdateStoryRequestSchema,
  UpdateStoryStateRequestSchema,
  WorldStateStoredSchema,
} from "../models.js"
import { createNewStory } from "../game.js"
import { desc } from "../schemas/field-descriptions.js"

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
  return c.json({
    id: row.id,
    title: row.title,
    opening_scenario: row.opening_scenario,
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
    characterId = db.createCharacter(body.character_data)
    character = {
      ...body.character_data,
      inventory: [],
    }
  } else {
    return c.json({ error: "Provide character_id or character_data" }, 400)
  }

  const id = createNewStory(
    body.title,
    body.opening_scenario,
    character,
    body.npcs ?? [],
    body.starting_scene,
    characterId,
  )
  return c.json({ id }, 201)
})

stories.put("/:id", zValidator("json", UpdateStoryRequestSchema), (c) => {
  const id = Number(c.req.param("id"))
  const row = db.getStory(id)
  if (!row) return c.json({ error: "Story not found" }, 404)
  db.updateStoryMeta(id, c.req.valid("json"))
  return c.json({ ok: true })
})

stories.put("/:id/state", zValidator("json", UpdateStoryStateRequestSchema), (c) => {
  const id = Number(c.req.param("id"))
  const row = db.getStory(id)
  if (!row) return c.json({ error: "Story not found" }, 404)
  const body = c.req.valid("json")
  const currentCharacter = MainCharacterStateSchema.parse(JSON.parse(row.character_state_json))
  const { world: currentWorld, npcs: currentNpcs } = parseStoryState(row)
  const nextCharacter = body.character ? MainCharacterStateSchema.parse(body.character) : currentCharacter
  const nextNpcs = body.npcs ? body.npcs.map((n) => NPCStateStoredSchema.parse(n)) : currentNpcs
  db.updateStory(id, nextCharacter, currentWorld, nextNpcs)
  return c.json({ character: nextCharacter, npcs: nextNpcs })
})

stories.delete("/:id", (c) => {
  const id = Number(c.req.param("id"))
  db.deleteStory(id)
  return c.json({ ok: true })
})

stories.get("/:id/export", (c) => {
  const id = Number(c.req.param("id"))
  const row = db.getStory(id)
  if (!row) return c.json({ error: "Story not found" }, 404)
  const { character, world, npcs } = parseStoryState(row)
  const turns = db.getTurnsForStory(id)
  const data = JSON.stringify(
    {
      title: row.title,
      opening_scenario: row.opening_scenario,
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

stories.post(
  "/import",
  zValidator(
    "json",
    z.object({
      title: z.string().describe(desc("requests.import_story.title")),
      opening_scenario: z.string().describe(desc("requests.import_story.opening_scenario")),
      character: MainCharacterStateSchema.describe(desc("requests.import_story.character")),
      world: WorldStateStoredSchema.describe(desc("requests.import_story.world")),
      npcs: z.array(NPCStateStoredSchema).describe(desc("requests.import_story.npcs")),
    }),
  ),
  (c) => {
    const body = c.req.valid("json")
    const base = {
      name: body.character.name,
      race: body.character.race,
      gender: body.character.gender,
      current_location: body.character.current_location,
      appearance: body.character.appearance,
      baseline_description: body.character.baseline_description,
      current_activity: body.character.current_activity,
      personality_traits: body.character.personality_traits,
      quirks: body.character.quirks,
      perks: body.character.perks,
      relationship_scores: body.character.relationship_scores,
    }
    const characterId = db.createCharacter(base)
    const id = db.createStory(body.title, body.opening_scenario, body.character, body.world, body.npcs, characterId)
    return c.json({ id }, 201)
  },
)

export default stories
