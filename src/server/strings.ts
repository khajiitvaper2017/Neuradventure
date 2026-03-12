import { readFileSync, statSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULTS_PATH = join(__dirname, "../../shared/server-defaults.json")
const LLM_STRINGS_PATH = join(__dirname, "../../shared/llm-strings.json")

type ServerDefaults = {
  format: {
    noneLower: string
    noneTitle: string
    nothing: string
  }
  unknown: {
    value: string
    location: string
    locationDetails: string
    appearance: string
    baselineAppearance: string
    clothing: string
    activity: string
    item: string
    npc: string
  }
  recentEventsSummary: string
  furtherDetailsUnknown: string
  defaultTimeOfDay: string
  fallbackTraits: string[]
}

type LlmStrings = {
  impersonateFallbackPrompt: string[]
  generateCharacter: {
    availableTraitsLine: string
    userPrompt: string
  }
  characterContextLabels: {
    name: string
    race: string
    gender: string
    appearance: string
    personalityTraits: string
    traits: string
    majorFlaws: string
    quirks: string
    perks: string
    baselineAppearance: string
    currentAppearance: string
    clothing: string
    currentActivity: string
    location: string
  }
  generateCharacterPart: {
    regenerate: string
    contextHeader: string
    instruction: string
    avoid: {
      appearance: string
      traits: string
      clothing: string
    }
  }
  generateStory: {
    characterHeader: string
    storyDescription: string
  }
  contextLabels: {
    baselineAppearance: string
    currentAppearance: string
    wearing: string
    nameRaceGender: string
    personalityTraits: string
    majorFlaws: string
    quirks: string
    perks: string
    location: string
    inventory: string
    scene: string
    date: string
    time: string
    race: string
    gender: string
    description: string
    characters: string
    items: string
  }
  sections: {
    initialCharacter: string
    playerCharacterBase: string
    npcBaselines: string
    locations: string
    memory: string
    authorNote: string
    playerCharacterState: string
    npcCurrentStates: string
    storyContext: string
    storySoFar: string
    storyContinuation: string
    playersAction: string
    introduceNewNpc: string
    actionMode: string
    compressedEarlierContext: string
  }
  actionModeHints: {
    say: string
    story: string
    do: string
  }
  playerSayPrefix: string
  authorNote: {
    wrapper: string
  }
}

let cachedDefaults: ServerDefaults | null = null
let cachedDefaultsMtime = 0
let cachedLlmStrings: LlmStrings | null = null
let cachedLlmStringsMtime = 0

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T
}

export function getServerDefaults(): ServerDefaults {
  const stat = statSync(DEFAULTS_PATH)
  if (!cachedDefaults || stat.mtimeMs !== cachedDefaultsMtime) {
    cachedDefaults = readJson<ServerDefaults>(DEFAULTS_PATH)
    cachedDefaultsMtime = stat.mtimeMs
  }
  return cachedDefaults
}

export function getLlmStrings(): LlmStrings {
  const stat = statSync(LLM_STRINGS_PATH)
  if (!cachedLlmStrings || stat.mtimeMs !== cachedLlmStringsMtime) {
    cachedLlmStrings = readJson<LlmStrings>(LLM_STRINGS_PATH)
    cachedLlmStringsMtime = stat.mtimeMs
  }
  return cachedLlmStrings
}

export function formatTemplate(template: string, values: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{${key}}`, value)
  }
  return result
}
