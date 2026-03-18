import { createStructuredPreviewExtractor } from "@/llm/structured-preview"

export type PreviewExtractor = { push: (delta: string) => Record<string, unknown> | null }

const DEFAULT_PREVIEW_KEYS: Record<string, string[]> = {
  TurnResponse: ["narrative_text", "background_events", "time_of_day"],
  GenerateCharacterResponse: ["name", "race", "gender", "general_description", "baseline_appearance", "custom_fields"],
  GenerateCharacterAppearanceResponse: ["baseline_appearance"],
  GenerateCharacterClothingResponse: ["current_clothing"],
  StoryResponse: [
    "title",
    "opening_scenario",
    "starting_location",
    "starting_date",
    "starting_time",
    "general_description",
  ],
  GenerateChatResponse: ["title", "greeting"],
}

export function getDefaultPreviewKeys(schemaName: string): string[] {
  return DEFAULT_PREVIEW_KEYS[schemaName] ? [...DEFAULT_PREVIEW_KEYS[schemaName]] : []
}

export function maybeCreatePreviewExtractor(shouldStream: boolean, previewKeys: string[]): PreviewExtractor | null {
  if (!shouldStream) return null
  if (previewKeys.length === 0) return null
  return createStructuredPreviewExtractor(previewKeys) as unknown as PreviewExtractor
}
