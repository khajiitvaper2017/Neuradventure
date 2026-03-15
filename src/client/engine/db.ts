export { getDb, flushDb, initEngineDb } from "./db/connection.js"
export { initDb } from "./db/init.js"

export type { CharacterBase, CharacterRow } from "./db/characters.js"
export {
  characterKey,
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  listStoryCharacterRefs,
  normalizeCharacterBase,
} from "./db/characters.js"

export type { CharacterCardFormat, CharacterCardRow, CharacterCardSummary } from "./db/character-cards.js"
export { getCharacterCard, getCharacterCardSummary, upsertCharacterCard } from "./db/character-cards.js"

export type { StoryRow, StoryCharacterRow, StoryNpcRow } from "./db/stories.js"
export {
  createStory,
  deleteStory,
  getStory,
  listStories,
  listStoriesWithCharacters,
  listStoriesWithNpcs,
  updateStory,
  updateStoryMeta,
} from "./db/stories.js"

export type { TurnRow, TurnVariantRow, CanceledTurnPayload, CanceledTurnVariantPayload } from "./db/turns.js"
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
} from "./db/turns.js"

export type {
  ChatMemberInput,
  ChatMemberRow,
  ChatMemberState,
  ChatMessageRow,
  ChatRow,
  CanceledChatExchangePayload,
} from "./db/chats.js"
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
} from "./db/chats.js"

export { DEFAULT_GENERATION, DEFAULT_SETTINGS, getSettings, updateSettings } from "./db/settings.js"

export type { RequestResultRow } from "./db/request-results.js"
export { getRequestResult, setRequestResult } from "./db/request-results.js"

export type { PromptHistoryKind } from "./db/prompt-history.js"
export {
  deletePromptHistory,
  listPromptHistory,
  upsertPromptHistory,
  upsertPromptHistoryMany,
} from "./db/prompt-history.js"

export type { PromptConfigKey, PromptConfigFileRow } from "./db/prompts.js"
export {
  PROMPT_CONFIG_KEYS,
  ensurePromptConfigDefaults,
  getMergedPromptConfig,
  listPromptConfigFiles,
  resetAllPromptConfigFiles,
  resetPromptConfigFile,
  updatePromptConfigFile,
} from "./db/prompts.js"

export type { SamplerPreset, SamplerPresetRow } from "./db/presets.js"
export { deleteSamplerPreset, listSamplerPresets, upsertSamplerPreset } from "./db/presets.js"
