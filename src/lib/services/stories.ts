import { z } from "zod"
import { AppError } from "@/errors"
import type { MainCharacterState, NPCState, StoryModules, StoryMeta } from "@/shared/types"
import type {
  CharacterImportResult,
  StoryCharacterGroup,
  StoryDetail,
  StoryNpcGroup,
  UpdateStoryStateResult,
} from "@/shared/api-types"
import * as db from "@/engine/core/db"
import { MainCharacterStateStoredSchema, NPCStateStoredSchema, WorldStateStoredSchema } from "@/engine/core/models"
import { createNewStory } from "@/engine/game"
import {
  TavernCardV2Schema,
  characterToTavernCard,
  detectImportFormat,
  extractCardJsonFromPng,
  parseTavernJSONL,
  storyToPlaintext,
  storyToTavernJSONL,
  tavernCardToCharacter,
  type TavernCardV2,
} from "@/engine/utils/converters/tavern"
import { normalizeStoryModules, StoryModulesSchema } from "@/engine/schemas/story-modules"

function downloadText(filename: string, text: string, mime: string): void {
  if (typeof window === "undefined") return
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function hashString(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function parseStoryState(row: db.StoryRow): {
  character: MainCharacterState
  world: ReturnType<typeof WorldStateStoredSchema.parse>
  initialWorld: ReturnType<typeof WorldStateStoredSchema.parse>
  npcs: ReturnType<typeof NPCStateStoredSchema.parse>[]
} {
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

function parseStoryModules(row: db.StoryRow): StoryModules {
  const defaults = db.getSettings().storyDefaults
  try {
    const raw = row.story_modules_json ? (JSON.parse(row.story_modules_json) as unknown) : null
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
  author_note_position: z.number().int().min(0).max(2).optional(),
  author_note_interval: z.number().int().min(0).max(1000).optional(),
  author_note_role: z.number().int().min(0).max(2).optional(),
  author_note_embed_state: z
    .union([z.boolean(), z.number().int().min(0).max(1)])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === 1)),
  turns: z.array(ImportTurnSchema).optional(),
})

export const stories = {
  list: async (): Promise<StoryMeta[]> => {
    const rows = db.listStories()
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      turn_count: r.turn_count,
      character_name: MainCharacterStateStoredSchema.parse(JSON.parse(r.character_state_json)).name,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
  },

  get: async (id: number): Promise<StoryDetail> => {
    const row = db.getStory(id)
    if (!row) throw new AppError(404, "Story not found")
    const { character, world, initialWorld, npcs } = parseStoryState(row)
    const storyModules = parseStoryModules(row)
    return {
      id: row.id,
      title: row.title,
      opening_scenario: row.opening_scenario,
      author_note: row.author_note ?? "",
      author_note_depth: row.author_note_depth ?? 4,
      author_note_position: row.author_note_position ?? 1,
      author_note_interval: row.author_note_interval ?? 1,
      author_note_role: row.author_note_role ?? 0,
      author_note_embed_state: (row.author_note_embed_state ?? 0) === 1,
      story_modules: storyModules,
      character,
      world,
      initial_world: initialWorld,
      npcs,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  },

  create: async (data: {
    title: string
    opening_scenario: string
    starting_scene?: string
    starting_date?: string
    starting_time?: string
    character_id?: number
    tavern_card?: object
    tavern_avatar_data_url?: string
    character_data?: Omit<MainCharacterState, "inventory">
    npcs?: NPCState[]
    story_modules?: StoryModules
  }): Promise<{ id: number }> => {
    let character: MainCharacterState
    let characterId: number | null = null

    if (data.character_id) {
      const charRow = db.getCharacter(data.character_id)
      if (!charRow) throw new AppError(404, "Character not found")
      const base = MainCharacterStateStoredSchema.parse(JSON.parse(charRow.state_json))
      const merged = data.character_data
        ? MainCharacterStateStoredSchema.parse({ ...base, ...data.character_data })
        : base
      character = { ...merged, inventory: [] }
      characterId = charRow.id
    } else if (data.character_data) {
      const parsed = MainCharacterStateStoredSchema.parse(data.character_data)
      const { inventory: _inventory, ...base } = parsed
      void _inventory
      characterId = db.createCharacter(base)
      if (data.tavern_card !== undefined && data.tavern_card !== null) {
        const parsedCard = TavernCardV2Schema.safeParse(data.tavern_card)
        if (!parsedCard.success) throw new AppError(400, "Invalid tavern_card payload")
        db.upsertCharacterCard(
          characterId,
          "tavern-card-v2",
          JSON.stringify(data.tavern_card),
          data.tavern_avatar_data_url ?? undefined,
        )
      }
      character = parsed
    } else {
      throw new AppError(400, "Provide character_id or character_data")
    }

    const id = createNewStory(
      data.title,
      data.opening_scenario,
      character,
      data.npcs ?? [],
      data.starting_scene,
      data.starting_date,
      data.starting_time,
      data.story_modules ?? db.getSettings().storyDefaults,
      characterId,
    )
    return { id }
  },

  update: async (
    id: number,
    data: {
      title?: string
      opening_scenario?: string
      author_note?: string
      author_note_depth?: number
      author_note_position?: number
      author_note_interval?: number
      author_note_role?: number
      author_note_embed_state?: boolean
      story_modules?: StoryModules
    },
  ): Promise<{ ok: boolean }> => {
    const row = db.getStory(id)
    if (!row) throw new AppError(404, "Story not found")
    db.updateStoryMeta(id, {
      title: data.title,
      opening_scenario: data.opening_scenario,
      author_note: data.author_note,
      author_note_depth: data.author_note_depth,
      author_note_position: data.author_note_position,
      author_note_interval: data.author_note_interval,
      author_note_role: data.author_note_role,
      author_note_embed_state: data.author_note_embed_state,
      story_modules: data.story_modules,
    })
    return { ok: true }
  },

  updateState: async (
    id: number,
    data: { character?: MainCharacterState; npcs?: NPCState[]; world?: { memory?: string } },
  ): Promise<UpdateStoryStateResult> => {
    const row = db.getStory(id)
    if (!row) throw new AppError(404, "Story not found")
    const currentCharacter = MainCharacterStateStoredSchema.parse(JSON.parse(row.character_state_json))
    const { world: currentWorld, npcs: currentNpcs } = parseStoryState(row)
    const nextCharacter = data.character ? MainCharacterStateStoredSchema.parse(data.character) : currentCharacter
    const nextNpcs = data.npcs ? data.npcs.map((n) => NPCStateStoredSchema.parse(n)) : currentNpcs
    const nextWorld = data.world ? { ...currentWorld, memory: data.world.memory ?? currentWorld.memory } : currentWorld
    db.updateStory(id, nextCharacter, nextWorld, nextNpcs)
    return { character: nextCharacter, world: nextWorld, npcs: nextNpcs }
  },

  delete: async (id: number): Promise<{ ok: boolean }> => {
    db.deleteStory(id)
    return { ok: true }
  },

  exportAndDownload: async (
    id: number,
    format: "neuradventure" | "tavern" | "plaintext" = "neuradventure",
  ): Promise<void> => {
    const row = db.getStory(id)
    if (!row) throw new AppError(404, "Story not found")
    const { character, world, npcs } = parseStoryState(row)
    const storyModules = parseStoryModules(row)
    const turns = db.getTurnsForStory(id)

    if (format === "tavern") {
      const jsonl = storyToTavernJSONL(row.title, row.opening_scenario, character.name, turns)
      downloadText(`story-${id}.jsonl`, jsonl, "application/x-jsonlines")
      return
    }

    if (format === "plaintext") {
      const text = storyToPlaintext(row.title, row.opening_scenario, turns)
      downloadText(`story-${id}.txt`, text, "text/plain; charset=utf-8")
      return
    }

    const data = JSON.stringify(
      {
        title: row.title,
        opening_scenario: row.opening_scenario,
        author_note: row.author_note ?? "",
        author_note_depth: row.author_note_depth ?? 4,
        author_note_position: row.author_note_position ?? 1,
        author_note_interval: row.author_note_interval ?? 1,
        author_note_role: row.author_note_role ?? 0,
        author_note_embed_state: (row.author_note_embed_state ?? 0) === 1,
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
    downloadText(`story-${id}.json`, data, "application/json")
  },

  import: async (data: object | string): Promise<{ id: number }> => {
    const format = detectImportFormat(data)

    if (format === "tavern-card") {
      throw new AppError(400, "Character card detected. Use character import instead.")
    }

    if (format === "tavern-jsonl") {
      const parsed = parseTavernJSONL(typeof data === "string" ? data : JSON.stringify(data))
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
            null,
            snapshot.character,
            snapshot.world,
            snapshot.npcs,
          )
        })
      }
      return { id: storyId }
    }

    if (format === "neuradventure") {
      const parsed = ImportStorySchema.parse(data)
      const { inventory: _inventory, ...base } = parsed.character
      void _inventory
      const characterId = db.createCharacter(base)
      const settings = db.getSettings()
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
        parsed.author_note_position ?? settings.defaultAuthorNotePosition ?? 1,
        parsed.author_note_interval ?? settings.defaultAuthorNoteInterval ?? 1,
        parsed.author_note_role ?? settings.defaultAuthorNoteRole ?? 0,
        parsed.author_note_embed_state ?? settings.defaultAuthorNoteEmbedState ?? false,
      )

      if (
        parsed.author_note !== undefined ||
        parsed.author_note_depth !== undefined ||
        parsed.author_note_position !== undefined ||
        parsed.author_note_interval !== undefined ||
        parsed.author_note_role !== undefined ||
        parsed.author_note_embed_state !== undefined
      ) {
        db.updateStoryMeta(id, {
          author_note: parsed.author_note,
          author_note_depth: parsed.author_note_depth,
          author_note_position: parsed.author_note_position,
          author_note_interval: parsed.author_note_interval,
          author_note_role: parsed.author_note_role,
          author_note_embed_state: parsed.author_note_embed_state,
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
              null,
              snapshot.character,
              snapshot.world,
              snapshot.npcs,
            )
          })
        }
      }

      return { id }
    }

    throw new AppError(400, "Unrecognized import format. Expected Neuradventure JSON or SillyTavern JSONL.")
  },

  characters: async (): Promise<StoryCharacterGroup[]> => {
    const characters = db.listCharacters()
    const storyRefs = db.listStoryCharacterRefs()
    const groups = new Map<number, StoryCharacterGroup>()

    for (const row of characters) {
      const parsed = MainCharacterStateStoredSchema.safeParse(JSON.parse(row.state_json))
      if (!parsed.success) continue
      const { inventory: _inventory, ...base } = parsed.data
      void _inventory
      groups.set(row.id, { id: row.id, character: base, card: db.getCharacterCardSummary(row.id), stories: [] })
    }

    for (const story of storyRefs) {
      if (!story.character_id) continue
      const entry = groups.get(story.character_id)
      if (entry) entry.stories.push({ id: story.id, title: story.title, updated_at: story.updated_at })
    }

    return Array.from(groups.values())
  },

  getCharacter: async (id: number): Promise<MainCharacterState> => {
    if (!Number.isFinite(id) || id <= 0) throw new AppError(400, "Invalid character id")
    const charRow = db.getCharacter(id)
    if (!charRow) throw new AppError(404, "Character not found")
    try {
      return MainCharacterStateStoredSchema.parse(JSON.parse(charRow.state_json))
    } catch {
      throw new AppError(400, "Stored character state is invalid JSON")
    }
  },

  deleteCharacter: async (id: number): Promise<{ ok: boolean }> => {
    if (!Number.isFinite(id) || id <= 0) throw new AppError(400, "Invalid character id")
    db.deleteCharacter(id)
    return { ok: true }
  },

  npcs: async (): Promise<StoryNpcGroup[]> => {
    const rows = db.listStoriesWithNpcs()
    const groups = new Map<string, StoryNpcGroup>()

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
          group = { key: `npc_${hashString(keySource)}`, npc: base, stories: [] }
          groups.set(keySource, group)
        }
        group.stories.push({ id: row.id, title: row.title, updated_at: row.updated_at })
      }
    }

    return Array.from(groups.values())
  },

  exportCharacterAndDownload: async (
    charId: number,
    format: "neuradventure" | "tavern-card" = "neuradventure",
  ): Promise<void> => {
    const charRow = db.getCharacter(charId)
    if (!charRow) throw new AppError(404, "Character not found")
    const parsed = MainCharacterStateStoredSchema.parse(JSON.parse(charRow.state_json))
    const safeName = parsed.name.replace(/\s+/g, "_") || "character"

    if (format === "tavern-card") {
      const cardRow = db.getCharacterCard(charId)
      if (cardRow) {
        try {
          const stored = JSON.parse(cardRow.card_json) as unknown
          const safeCard = TavernCardV2Schema.parse(stored)
          const { inventory: _inventory, ...base } = parsed
          void _inventory
          safeCard.data.name = parsed.name
          safeCard.data.extensions = { ...safeCard.data.extensions, neuradventure: base }
          downloadText(`character-${safeName}.json`, JSON.stringify(safeCard, null, 2), "application/json")
          return
        } catch {
          // fall through to generated card
        }
      }

      const card = characterToTavernCard(parsed)
      downloadText(`character-${safeName}.json`, JSON.stringify(card, null, 2), "application/json")
      return
    }

    const { inventory: _inventory, ...base } = parsed
    void _inventory
    downloadText(`character-${safeName}.json`, JSON.stringify(base, null, 2), "application/json")
  },

  getCharacterCard: async (charId: number): Promise<object> => {
    const charRow = db.getCharacter(charId)
    if (!charRow) throw new AppError(404, "Character not found")
    const row = db.getCharacterCard(charId)
    if (!row) throw new AppError(404, "No stored character card")
    try {
      const stored = JSON.parse(row.card_json) as unknown
      const card = TavernCardV2Schema.parse(stored)
      return card as unknown as object
    } catch {
      throw new AppError(400, "Stored character card is invalid JSON")
    }
  },

  importCharacter: async (body: object): Promise<CharacterImportResult> => {
    const record = body as Record<string, unknown>

    if ("png_base64" in record || "png_data_url" in record) {
      const PngSchema = z
        .object({
          png_base64: z.string().optional(),
          png_data_url: z.string().optional(),
          filename: z.string().optional(),
        })
        .passthrough()
      const parsed = PngSchema.parse(body)
      const dataUrl =
        typeof parsed.png_data_url === "string" && parsed.png_data_url.trim()
          ? parsed.png_data_url.trim()
          : typeof parsed.png_base64 === "string" && parsed.png_base64.trim()
            ? `data:image/png;base64,${parsed.png_base64.trim()}`
            : ""
      const base64 = dataUrl.includes(",") ? dataUrl.split(",", 2)[1] : dataUrl
      if (!base64) throw new AppError(400, "Invalid PNG payload. Expected png_base64 or png_data_url.")

      let extracted: { card: unknown }
      try {
        extracted = extractCardJsonFromPng(base64ToBytes(base64))
      } catch (err) {
        throw new AppError(400, err instanceof Error ? err.message : "Invalid PNG character card")
      }

      const originalCard = extracted.card as unknown
      const parsedCard = TavernCardV2Schema.safeParse(originalCard)
      if (!parsedCard.success) throw new AppError(400, "Invalid embedded character card JSON")
      const result = tavernCardToCharacter(parsedCard.data as TavernCardV2)
      if (!result.needs_review) {
        const characterId = db.createCharacter(result.character)
        db.upsertCharacterCard(characterId, "tavern-card-v2", JSON.stringify(originalCard), dataUrl)
        return { id: characterId, character: result.character, needs_review: false }
      }
      return {
        character: result.character,
        needs_review: true,
        source: result.source,
        source_text: result.source_text,
        tavern_card: originalCard as object,
        tavern_avatar_data_url: dataUrl,
      }
    }

    if (record && typeof record === "object" && "character" in record) {
      const WrapperSchema = z
        .object({
          character: MainCharacterStateStoredSchema,
          tavern_card: z.unknown().optional(),
          tavern_avatar_data_url: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.string().min(1).optional(),
          ),
        })
        .passthrough()
      const wrapper = WrapperSchema.parse(body)
      const { inventory: _inventory, ...base } = wrapper.character
      void _inventory
      const characterId = db.createCharacter(base)
      if (wrapper.tavern_card !== undefined && wrapper.tavern_card !== null) {
        const parsedCard = TavernCardV2Schema.safeParse(wrapper.tavern_card)
        if (!parsedCard.success) throw new AppError(400, "Invalid tavern_card payload")
        db.upsertCharacterCard(
          characterId,
          "tavern-card-v2",
          JSON.stringify(wrapper.tavern_card),
          wrapper.tavern_avatar_data_url ?? undefined,
        )
      }
      return { id: characterId, character: base, needs_review: false }
    }

    const format = detectImportFormat(body)
    if (format === "tavern-card") {
      const originalCard = body as unknown
      const parsedCard = TavernCardV2Schema.safeParse(originalCard)
      if (!parsedCard.success) {
        const issue = parsedCard.error.issues[0]
        const path = issue?.path?.length ? issue.path.join(".") : "(root)"
        const message = issue?.message
          ? `Invalid TavernCardV2 JSON: ${path}: ${issue.message}`
          : "Invalid TavernCardV2 JSON"
        throw new AppError(400, message)
      }
      const result = tavernCardToCharacter(parsedCard.data as TavernCardV2)
      if (!result.needs_review) {
        const characterId = db.createCharacter(result.character)
        db.upsertCharacterCard(characterId, "tavern-card-v2", JSON.stringify(originalCard))
        return { id: characterId, character: result.character, needs_review: false }
      }
      return {
        character: result.character,
        needs_review: true,
        source: result.source,
        source_text: result.source_text,
        tavern_card: originalCard as object,
      }
    }

    const parsed = MainCharacterStateStoredSchema.safeParse(body)
    if (parsed.success) {
      const { inventory: _inventory, ...base } = parsed.data
      void _inventory
      const characterId = db.createCharacter(base)
      return { id: characterId, character: base, needs_review: false }
    }

    throw new AppError(400, "Unrecognized import format. Expected TavernCardV2 or Neuradventure character.")
  },
}
