import { buildStoryResponseSchema, type StoryModules, type StoryResponse } from "@/engine/core/models"
import { callLLMRaw } from "@/engine/llm/call"
import { getGenerateStoryPrompt } from "@/engine/llm/config"
import { formatTemplate, getLlmStrings, getServerDefaults } from "@/engine/core/strings"
import { DEFAULT_STORY_MODULES, resolveModuleFlags } from "@/engine/schemas/story-modules"

export async function generateStory(
  description: string,
  character: {
    name: string
    race: string
    gender: string
    general_description?: string
    current_location?: string
    baseline_appearance?: string
    current_appearance?: string
    current_clothing?: string
    personality_traits?: string[]
    major_flaws?: string[]
    perks?: string[]
  },
  storyModules?: StoryModules,
  options: { onPreviewPatch?: (patch: Record<string, unknown>) => void } = {},
): Promise<StoryResponse> {
  const modules = storyModules ?? DEFAULT_STORY_MODULES
  const flags = resolveModuleFlags(modules)
  const responseSchema = buildStoryResponseSchema(modules)
  const llmStrings = getLlmStrings()
  const defaults = getServerDefaults()
  const unknown = defaults.unknown.value
  const noneTitle = defaults.format.noneTitle
  const traits = [
    ...(flags.useCharPersonalityTraits ? (character.personality_traits ?? []) : []),
    ...(flags.useCharPerks ? (character.perks ?? []) : []),
  ]
    .map((t) => t.trim())
    .filter(Boolean)
  const majorFlaws = flags.useCharMajorFlaws ? (character.major_flaws?.map((t) => t.trim()).filter(Boolean) ?? []) : []
  const generalDescription = character.general_description?.trim() || defaults.unknown.generalDescription
  const promptLines = getGenerateStoryPrompt(modules).split("\n")
  const result = await callLLMRaw(
    [
      { role: "system", content: promptLines.join("\n") },
      {
        role: "user",
        content: [
          llmStrings.generateStory.characterHeader,
          formatTemplate(llmStrings.characterContextLabels.name, { value: character.name }),
          formatTemplate(llmStrings.characterContextLabels.race, { value: character.race || unknown }),
          formatTemplate(llmStrings.characterContextLabels.gender, { value: character.gender || unknown }),
          formatTemplate(llmStrings.characterContextLabels.generalDescription, { value: generalDescription }),
          formatTemplate(llmStrings.characterContextLabels.baselineAppearance, {
            value: character.baseline_appearance || unknown,
          }),
          ...(flags.useCharAppearance
            ? [
                formatTemplate(llmStrings.characterContextLabels.currentAppearance, {
                  value: character.current_appearance || character.baseline_appearance || unknown,
                }),
                formatTemplate(llmStrings.characterContextLabels.clothing, {
                  value: character.current_clothing || unknown,
                }),
              ]
            : []),
          ...(flags.useCharMajorFlaws
            ? [
                formatTemplate(llmStrings.characterContextLabels.majorFlaws, {
                  value: majorFlaws.length > 0 ? majorFlaws.join(", ") : noneTitle,
                }),
              ]
            : []),
          ...(flags.useCharPersonalityTraits || flags.useCharPerks
            ? [
                formatTemplate(llmStrings.characterContextLabels.traits, {
                  value: traits.length > 0 ? traits.join(", ") : unknown,
                }),
              ]
            : []),
          formatTemplate(llmStrings.generateStory.storyDescription, { description }),
        ].join("\n"),
      },
    ],
    "StoryResponse",
    responseSchema,
    undefined,
    { disableRepetition: true, ...(options.onPreviewPatch ? { onPreviewPatch: options.onPreviewPatch } : {}) },
  )
  return result
}
