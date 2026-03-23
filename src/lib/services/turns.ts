import { AppError } from "@/errors"
import * as db from "@/db/core"
import { WorldStateStoredSchema } from "@/types/models"
import {
  buildTurnResultFromRow,
  cancelLastTurn,
  createNpcFromTurnPrompt,
  impersonatePlayerAction,
  processTurn,
  regenerateLastTurn,
  selectTurnVariant,
  undoCancelLastTurn,
} from "@/domain/story"
import { createOrGetSession, publishComplete, publishError, publishPreview } from "@/llm/io/streaming"
import { isProbablyOfflineError } from "@/services/requests/offline"
import type {
  CancelLastResult,
  CreateNpcResult,
  ImpersonateResult,
  SelectTurnVariantResult,
  TurnResult,
  TurnVariantsResponse,
  UndoCancelResult,
} from "@/types/api"
import type { TurnSummary } from "@/types/types"

const inFlight = new Map<string, ReturnType<typeof processTurn>>()
const npcInFlight = new Map<string, ReturnType<typeof createNpcFromTurnPrompt>>()

function asLlmAppError(err: unknown): AppError {
  const message = err instanceof Error ? err.message : String(err)
  if (isProbablyOfflineError(err)) {
    return new AppError(503, "LLM request failed. Are you offline, or is the LLM URL blocked by CORS?")
  }
  if (message.includes("ECONNREFUSED")) {
    return new AppError(503, "KoboldCpp is not running. Please start KoboldCpp first.")
  }
  return new AppError(500, "LLM generation failed: " + message)
}

export const turns = {
  list: async (storyId: number): Promise<TurnSummary[]> => {
    const rows = db.getTurnsForStory(storyId)
    return rows.map((t) => ({
      id: t.id,
      turn_number: t.turn_number,
      action_mode: t.action_mode as "do" | "say" | "story",
      active_variant_id: t.active_variant_id,
      player_input: t.player_input,
      narrative_text: t.narrative_text,
      background_events: t.background_events,
      world: WorldStateStoredSchema.parse(JSON.parse(t.world_snapshot_json)),
      created_at: t.created_at,
    }))
  },

  take: async (
    storyId: number,
    playerInput: string,
    actionMode: "do" | "say" | "story",
    requestId?: string,
  ): Promise<TurnResult> => {
    const story = db.getStory(storyId)
    if (!story) throw new AppError(404, "Story not found")

    const trimmedRequestId = requestId?.trim() || undefined
    const streamingEnabled = db.getSettings().streamingEnabled
    const shouldStream = streamingEnabled && !!trimmedRequestId

    try {
      if (trimmedRequestId) {
        const existing = db.getTurnByRequestId(trimmedRequestId)
        if (existing) return buildTurnResultFromRow(existing)
        const inflight = inFlight.get(trimmedRequestId)
        if (inflight) return await inflight
      }

      if (shouldStream && trimmedRequestId) createOrGetSession(trimmedRequestId, "turn")
      const task = processTurn(storyId, playerInput, actionMode, trimmedRequestId, {
        onPreviewPatch:
          shouldStream && trimmedRequestId ? (patch) => publishPreview(trimmedRequestId, patch) : undefined,
      })
      if (trimmedRequestId) inFlight.set(trimmedRequestId, task)
      try {
        const result = await task
        if (shouldStream && trimmedRequestId) publishComplete(trimmedRequestId)
        return result
      } finally {
        if (trimmedRequestId) inFlight.delete(trimmedRequestId)
      }
    } catch (err) {
      if (trimmedRequestId && streamingEnabled)
        publishError(trimmedRequestId, err instanceof Error ? err.message : "Generation failed")
      throw asLlmAppError(err)
    }
  },

  createNpc: async (storyId: number, npcName: string, requestId?: string): Promise<CreateNpcResult> => {
    const story = db.getStory(storyId)
    if (!story) throw new AppError(404, "Story not found")

    const trimmedRequestId = requestId?.trim() || undefined
    try {
      if (trimmedRequestId) {
        const inflight = npcInFlight.get(trimmedRequestId)
        if (inflight) return await inflight
      }

      const task = createNpcFromTurnPrompt(storyId, npcName)
      if (trimmedRequestId) npcInFlight.set(trimmedRequestId, task)
      try {
        return await task
      } finally {
        if (trimmedRequestId) npcInFlight.delete(trimmedRequestId)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (isProbablyOfflineError(err) || message.includes("ECONNREFUSED")) {
        throw new AppError(503, "KoboldCpp is not running. Please start KoboldCpp first.")
      }
      if (message.includes("not found")) throw new AppError(404, message)
      throw new AppError(400, message)
    }
  },

  regenerateLast: async (
    storyId: number,
    actionMode: "do" | "say" | "story",
    requestId?: string,
  ): Promise<TurnResult> => {
    const story = db.getStory(storyId)
    if (!story) throw new AppError(404, "Story not found")

    const trimmedRequestId = requestId?.trim() || undefined
    const streamingEnabled = db.getSettings().streamingEnabled
    const shouldStream = streamingEnabled && !!trimmedRequestId

    try {
      if (shouldStream && trimmedRequestId) createOrGetSession(trimmedRequestId, "turn")
      const result = await regenerateLastTurn(storyId, actionMode, trimmedRequestId, {
        onPreviewPatch:
          shouldStream && trimmedRequestId ? (patch) => publishPreview(trimmedRequestId, patch) : undefined,
      })
      if (shouldStream && trimmedRequestId) publishComplete(trimmedRequestId)
      return result
    } catch (err) {
      if (trimmedRequestId && streamingEnabled)
        publishError(trimmedRequestId, err instanceof Error ? err.message : "Generation failed")
      const message = err instanceof Error ? err.message : String(err)
      if (isProbablyOfflineError(err) || message.includes("ECONNREFUSED")) {
        throw new AppError(503, "KoboldCpp is not running. Please start KoboldCpp first.")
      }
      if (message.includes("not found")) throw new AppError(404, message)
      throw new AppError(500, "LLM generation failed: " + message)
    }
  },

  impersonate: async (
    storyId: number,
    actionMode: "do" | "say" | "story",
    requestId?: string,
  ): Promise<ImpersonateResult> => {
    const story = db.getStory(storyId)
    if (!story) throw new AppError(404, "Story not found")

    const trimmedRequestId = requestId?.trim() || undefined
    const streamingEnabled = db.getSettings().streamingEnabled
    const shouldStream = streamingEnabled && !!trimmedRequestId

    try {
      if (shouldStream && trimmedRequestId) createOrGetSession(trimmedRequestId, "chat.reply")
      const result = await impersonatePlayerAction(storyId, actionMode, trimmedRequestId, {
        onText:
          shouldStream && trimmedRequestId ? (text) => publishPreview(trimmedRequestId, { content: text }) : undefined,
      })
      if (shouldStream && trimmedRequestId) publishComplete(trimmedRequestId)
      return result
    } catch (err) {
      if (trimmedRequestId && streamingEnabled)
        publishError(trimmedRequestId, err instanceof Error ? err.message : "Generation failed")
      throw asLlmAppError(err)
    }
  },

  cancelLast: async (storyId: number): Promise<CancelLastResult> => {
    try {
      return cancelLastTurn(storyId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("not found")) throw new AppError(404, message)
      throw new AppError(400, message)
    }
  },

  undoCancel: async (storyId: number): Promise<UndoCancelResult> => {
    try {
      return undoCancelLastTurn(storyId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("not found")) throw new AppError(404, message)
      throw new AppError(400, message)
    }
  },

  variants: async (turnId: number): Promise<TurnVariantsResponse> => {
    const turn = db.getTurn(turnId)
    if (!turn) throw new AppError(404, "Turn not found")
    const variants = db.listTurnVariants(turnId)
    return {
      active_variant_id: turn.active_variant_id,
      variants: variants.map((v) => ({
        id: v.id,
        variant_index: v.variant_index,
        narrative_text: v.narrative_text,
        created_at: v.created_at,
      })),
    }
  },

  selectVariant: async (turnId: number, variantId: number): Promise<SelectTurnVariantResult> => {
    try {
      return selectTurnVariant(turnId, variantId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("not found")) throw new AppError(404, message)
      throw new AppError(400, message)
    }
  },

  update: async (
    turnId: number,
    data: { player_input?: string; narrative_text?: string },
  ): Promise<{ ok: boolean }> => {
    if (data.player_input === undefined && data.narrative_text === undefined) {
      throw new AppError(400, "Nothing to update")
    }
    const updated = db.updateTurn(turnId, data)
    if (!updated) throw new AppError(404, "Turn not found")
    return { ok: true }
  },

  delete: async (turnId: number): Promise<{ ok: boolean }> => {
    const deleted = db.deleteTurn(turnId)
    if (!deleted) throw new AppError(404, "Turn not found")
    return { ok: true }
  },
}

export type { TurnSummary }
