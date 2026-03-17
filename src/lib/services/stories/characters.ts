import { z } from "zod"
import { AppError } from "@/errors"
import type { MainCharacterState } from "@/shared/types"
import type { CharacterImportResult, StoryCharacterGroup } from "@/shared/api-types"
import * as db from "@/engine/core/db"
import { MainCharacterStateStoredSchema } from "@/engine/core/models"
import {
  characterToTavernCard,
  detectImportFormat,
  extractCardJsonFromPng,
  TavernCardV2Schema,
  tavernCardToCharacter,
  type TavernCardV2,
} from "@/engine/utils/converters/tavern"
import { base64ToBytes, downloadText } from "@/services/stories/utils"

export async function characters(): Promise<StoryCharacterGroup[]> {
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
}

export async function getCharacter(id: number): Promise<MainCharacterState> {
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, "Invalid character id")
  const charRow = db.getCharacter(id)
  if (!charRow) throw new AppError(404, "Character not found")
  try {
    return MainCharacterStateStoredSchema.parse(JSON.parse(charRow.state_json))
  } catch {
    throw new AppError(400, "Stored character state is invalid JSON")
  }
}

export async function deleteCharacter(id: number): Promise<{ ok: boolean }> {
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, "Invalid character id")
  db.deleteCharacter(id)
  return { ok: true }
}

export async function exportCharacterAndDownload(
  charId: number,
  format: "neuradventure" | "tavern-card" = "neuradventure",
): Promise<void> {
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
}

export async function getCharacterCard(charId: number): Promise<object> {
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
}

export async function importCharacter(body: object): Promise<CharacterImportResult> {
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
    } else if (wrapper.tavern_avatar_data_url) {
      const card = characterToTavernCard(base)
      db.upsertCharacterCard(characterId, "tavern-card-v2", JSON.stringify(card), wrapper.tavern_avatar_data_url)
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
}
