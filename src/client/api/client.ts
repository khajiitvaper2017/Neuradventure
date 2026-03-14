import { chats } from "./chats.js"
import { generate } from "./generate.js"
import { settings } from "./settings.js"
import { stories } from "./stories.js"
import { turns } from "./turns.js"
import { promptHistory } from "./promptHistory.js"

export { ApiError } from "./http.js"

export const api = {
  stories,
  chats,
  turns,
  generate,
  settings,
  promptHistory,
}

export type * from "../../../shared/types.js"
export type * from "./types.js"
