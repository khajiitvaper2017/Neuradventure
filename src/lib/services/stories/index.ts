import {
  characters,
  deleteCharacter,
  exportCharacterAndDownload,
  getCharacter,
  getCharacterCard,
  importCharacter,
} from "@/services/stories/characters"
import { create, deleteStory, get, list, update, updateState } from "@/services/stories/crud"
import { exportAndDownload } from "@/services/stories/export"
import { importStory } from "@/services/stories/import"
import { npcs } from "@/services/stories/npcs"

export const stories = {
  list,
  get,
  create,
  update,
  updateState,
  delete: deleteStory,
  exportAndDownload,
  import: importStory,
  characters,
  getCharacter,
  deleteCharacter,
  npcs,
  exportCharacterAndDownload,
  getCharacterCard,
  importCharacter,
} satisfies {
  list: typeof list
  get: typeof get
  create: typeof create
  update: typeof update
  updateState: typeof updateState
  delete: typeof deleteStory
  exportAndDownload: typeof exportAndDownload
  import: typeof importStory
  characters: typeof characters
  getCharacter: typeof getCharacter
  deleteCharacter: typeof deleteCharacter
  npcs: typeof npcs
  exportCharacterAndDownload: typeof exportCharacterAndDownload
  getCharacterCard: typeof getCharacterCard
  importCharacter: typeof importCharacter
}
