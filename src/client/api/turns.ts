import { request } from "./http.js"
import type { MainCharacterState, NPCState, StoryModules, TurnSummary } from "../../../shared/types.js"
import type {
  CancelLastResult,
  CreateNpcResult,
  ImpersonateResult,
  SelectTurnVariantResult,
  TurnResult,
  TurnVariantsResponse,
  UndoCancelResult,
} from "./types.js"

export const turns = {
  list: (storyId: number) => request<TurnSummary[]>(`/api/turns/${storyId}`),
  take: (storyId: number, playerInput: string, actionMode: "do" | "say" | "story", requestId?: string) =>
    request<TurnResult>("/api/turns", {
      method: "POST",
      body: JSON.stringify({
        story_id: storyId,
        player_input: playerInput,
        action_mode: actionMode,
        request_id: requestId,
      }),
    }),
  createNpc: (storyId: number, npcName: string, requestId?: string) =>
    request<CreateNpcResult>("/api/turns/create-npc", {
      method: "POST",
      body: JSON.stringify({
        story_id: storyId,
        player_input: npcName,
        action_mode: "do",
        request_id: requestId,
      }),
    }),
  regenerateLast: (storyId: number, actionMode: "do" | "say" | "story") =>
    request<TurnResult>("/api/turns/regenerate-last", {
      method: "POST",
      body: JSON.stringify({ story_id: storyId, action_mode: actionMode }),
    }),
  impersonate: (storyId: number, actionMode: "do" | "say" | "story") =>
    request<ImpersonateResult>("/api/turns/impersonate", {
      method: "POST",
      body: JSON.stringify({ story_id: storyId, action_mode: actionMode }),
    }),
  cancelLast: (storyId: number) =>
    request<CancelLastResult>("/api/turns/cancel-last", {
      method: "POST",
      body: JSON.stringify({ story_id: storyId }),
    }),
  undoCancel: (storyId: number) =>
    request<UndoCancelResult>("/api/turns/undo-cancel", {
      method: "POST",
      body: JSON.stringify({ story_id: storyId }),
    }),
  variants: (turnId: number) => request<TurnVariantsResponse>(`/api/turns/${turnId}/variants`),
  selectVariant: (turnId: number, variantId: number) =>
    request<SelectTurnVariantResult>(`/api/turns/${turnId}/variants/select`, {
      method: "POST",
      body: JSON.stringify({ variant_id: variantId }),
    }),
  update: (turnId: number, data: { player_input?: string; narrative_text?: string }) =>
    request<{ ok: boolean }>(`/api/turns/${turnId}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (turnId: number) => request<{ ok: boolean }>(`/api/turns/${turnId}`, { method: "DELETE" }),
}

export type { MainCharacterState, NPCState, StoryModules }
