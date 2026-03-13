import { buildStoryResponseSchema, type StoryModules, type StoryResponse } from "../core/models.js"
import { callLLMRaw } from "./call.js"
import { getGenerateStoryPrompt } from "./config.js"
import { formatTemplate, getLlmStrings, getServerDefaults } from "../core/strings.js"
import { DEFAULT_STORY_MODULES, resolveModuleFlags } from "../schemas/story-modules.js"

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
    quirks?: string[]
    perks?: string[]
  },
  storyModules?: StoryModules,
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
    ...(flags.useCharQuirks ? (character.quirks ?? []) : []),
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
          ...(flags.useCharAppearance
            ? [
                formatTemplate(llmStrings.characterContextLabels.baselineAppearance, {
                  value: character.baseline_appearance || unknown,
                }),
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
          ...(flags.useCharPersonalityTraits || flags.useCharQuirks || flags.useCharPerks
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
    { disableRepetition: true },
  )
  return result
}
