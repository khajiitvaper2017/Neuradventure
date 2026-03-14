import type { MainCharacterState } from "../models.js"

export type CharacterBase = Omit<MainCharacterState, "inventory">

export type {
  AppSettings,
  GenerationParams,
  KoboldCppConnector,
  LLMConnector,
  ModelInfo,
  OpenRouterConnector,
  SectionFormat,
  SettingsState,
  TimeoutSettings,
} from "../../../../shared/api-types.js"
