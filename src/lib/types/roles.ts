export enum LlmRole {
  System = "system",
  User = "user",
  Assistant = "assistant",
}

export enum CharacterRole {
  Player = "player",
  Npc = "npc",
}

export type ConversationRole = LlmRole.User | LlmRole.Assistant
