import serverDefaults from "@/config/server-defaults.json"
import llmStrings from "@/config/llm-strings.json"

type ServerDefaults = typeof serverDefaults
type LlmStrings = typeof llmStrings

export function getServerDefaults(): ServerDefaults {
  return serverDefaults as ServerDefaults
}

export function getLlmStrings(): LlmStrings {
  return llmStrings as LlmStrings
}

export function formatTemplate(template: string, values: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{${key}}`, value)
  }
  return result
}
