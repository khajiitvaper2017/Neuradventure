export { getDb, flushDb, initEngineDb } from "@/engine/db/connection"
export { initDb } from "@/engine/db/init"

export type { CharacterBase, CharacterRow } from "@/engine/db/characters"
export {
  characterKey,
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  listStoryCharacterRefs,
  normalizeCharacterBase,
} from "@/engine/db/characters"

export type { CharacterCardFormat, CharacterCardRow, CharacterCardSummary } from "@/engine/db/character-cards"
export { getCharacterCard, getCharacterCardSummary, upsertCharacterCard } from "@/engine/db/character-cards"

export type { StoryRow, StoryCharacterRow, StoryNpcRow } from "@/engine/db/stories"
export {
  createStory,
  deleteStory,
  getStory,
  listStories,
  listStoriesWithCharacters,
  listStoriesWithNpcs,
  updateStory,
  updateStoryMeta,
} from "@/engine/db/stories"

export type { TurnRow, TurnVariantRow, CanceledTurnPayload, CanceledTurnVariantPayload } from "@/engine/db/turns"
export {
  clearCanceledTurn,
  createTurn,
  createTurnVariant,
  deleteTurn,
  getCanceledTurn,
  getLastTurnForStory,
  getNextTurnNumber,
  getTurn,
  getTurnByRequestId,
  getTurnVariant,
  getTurnsForStory,
  listTurnVariants,
  saveCanceledTurn,
  setActiveTurnVariant,
  updateTurn,
  updateTurnSnapshot,
} from "@/engine/db/turns"

export type {
  ChatMemberInput,
  ChatMemberRow,
  ChatMemberState,
  ChatMessageRow,
  ChatRow,
  CanceledChatExchangePayload,
} from "@/engine/db/chats"
export {
  advanceChatSpeaker,
  appendChatMessage,
  clearCanceledChatExchange,
  createChat,
  deleteChat,
  deleteChatMessage,
  getCanceledChatExchange,
  getChat,
  getChatMessage,
  getNextChatMessageIndex,
  listChatMembers,
  listChatMessages,
  listChats,
  setCanceledChatExchange,
  updateChat,
  updateChatMessage,
  updateChatNextSpeaker,
} from "@/engine/db/chats"

export { DEFAULT_GENERATION, DEFAULT_SETTINGS, getSettings, updateSettings } from "@/engine/db/settings"

export type { RequestResultRow } from "@/engine/db/request-results"
export { getRequestResult, setRequestResult } from "@/engine/db/request-results"

export type { PromptHistoryKind } from "@/engine/db/prompt-history"
export {
  deletePromptHistory,
  listPromptHistory,
  upsertPromptHistory,
  upsertPromptHistoryMany,
} from "@/engine/db/prompt-history"

export type { PromptTemplateKey, PromptTemplateFileRow } from "@/engine/db/prompts"
export {
  PROMPT_TEMPLATE_KEYS,
  ensurePromptTemplateDefaults,
  getMergedPromptConfig,
  listPromptTemplateFiles,
  resetAllPromptTemplateFiles,
  resetPromptTemplateFile,
  updatePromptTemplateFile,
} from "@/engine/db/prompts"

export type { SamplerPreset, SamplerPresetRow } from "@/engine/db/presets"
export { deleteSamplerPreset, listSamplerPresets, upsertSamplerPreset } from "@/engine/db/presets"

export type {
  CustomFieldDef,
  CustomFieldPlacement,
  CustomFieldScope,
  CustomFieldValueType,
  CharacterCustomFieldPlacement,
  WorldCustomFieldPlacement,
} from "@/shared/api-types"
export {
  deleteCustomField,
  getCustomFieldsMaxUpdatedAt,
  listCustomFields,
  upsertCustomField,
} from "@/engine/db/custom-fields"

export {
  getFieldPromptOverridesMaxUpdatedAt,
  getFieldPromptOverridesRow,
  resetAllFieldPromptOverrides,
  resetFieldPromptOverride,
  setFieldPromptOverride,
} from "@/engine/db/field-prompt-overrides"
