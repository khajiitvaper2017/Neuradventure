export { getDb, flushDb, initEngineDb } from "@/db/connection"
export { initDb } from "@/db/init"

export type { CharacterBase, CharacterRow } from "@/db/characters"
export {
  characterKey,
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  listStoryCharacterRefs,
  normalizeCharacterBase,
} from "@/db/characters"

export type { CharacterCardFormat, CharacterCardRow, CharacterCardSummary } from "@/db/character-cards"
export { getCharacterCard, getCharacterCardSummary, upsertCharacterCard } from "@/db/character-cards"

export type { StoryRow, StoryCharacterRow, StoryNpcRow } from "@/db/stories"
export {
  createStory,
  deleteStory,
  getStory,
  listStories,
  listStoriesWithCharacters,
  listStoriesWithNpcs,
  updateStory,
  updateStoryMeta,
} from "@/db/stories"

export type { TurnRow, TurnVariantRow, CanceledTurnPayload, CanceledTurnVariantPayload } from "@/db/turns"
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
} from "@/db/turns"

export type {
  ChatMemberInput,
  ChatMemberRow,
  ChatMemberState,
  ChatMessageRow,
  ChatRow,
  CanceledChatExchangePayload,
} from "@/db/chats"
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
} from "@/db/chats"

export { DEFAULT_GENERATION, DEFAULT_SETTINGS, getSettings, updateSettings } from "@/db/settings"

export type { RequestResultRow } from "@/db/request-results"
export { getRequestResult, setRequestResult } from "@/db/request-results"

export type { PromptHistoryKind } from "@/db/prompt-history"
export {
  clearAllPromptHistory,
  deletePromptHistory,
  listPromptHistory,
  upsertPromptHistory,
  upsertPromptHistoryMany,
} from "@/db/prompt-history"

export type { PromptTemplateKey, PromptTemplateFileRow } from "@/db/prompts"
export {
  PROMPT_TEMPLATE_KEYS,
  ensurePromptTemplateDefaults,
  getMergedPromptConfig,
  listPromptTemplateFiles,
  resetAllPromptTemplateFiles,
  resetPromptTemplateFile,
  updatePromptTemplateFile,
} from "@/db/prompts"

export type { SamplerPreset, SamplerPresetRow } from "@/db/presets"
export { deleteAllSamplerPresets, deleteSamplerPreset, listSamplerPresets, upsertSamplerPreset } from "@/db/presets"

export type {
  CustomFieldDef,
  CustomFieldPlacement,
  CustomFieldScope,
  CustomFieldValueType,
  CharacterCustomFieldPlacement,
  WorldCustomFieldPlacement,
} from "@/types/api"
export {
  deleteAllCustomFields,
  deleteCustomField,
  getCustomFieldsMaxUpdatedAt,
  listCustomFields,
  upsertCustomField,
} from "@/db/custom-fields"

export {
  getFieldPromptOverridesMaxUpdatedAt,
  getFieldPromptOverridesRow,
  resetAllFieldPromptOverrides,
  resetFieldPromptOverride,
  setFieldPromptOverride,
} from "@/db/field-prompt-overrides"
