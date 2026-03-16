import {
  GenerateCharacterAppearanceResponseSchema,
  GenerateCharacterClothingResponseSchema,
  GenerateCharacterTraitsResponseSchema,
  buildGenerateCharacterResponseSchema,
  type GenerateCharacterAppearanceResponse,
  type GenerateCharacterClothingResponse,
  type GenerateCharacterResponse,
  type GenerateCharacterTraitsResponse,
  type StoryModules,
} from "@/engine/core/models"
import { callLLMRaw } from "@/engine/llm/call"
import { getGenerateCharacterPrompt, npcTraits } from "@/engine/llm/config"
import { formatTemplate, getLlmStrings, getServerDefaults } from "@/engine/core/strings"
import { DEFAULT_STORY_MODULES } from "@/engine/schemas/story-modules"

export async function generateCharacter(
  description: string,
  storyModules?: StoryModules,
  options: { onPreviewPatch?: (patch: Record<string, unknown>) => void } = {},
): Promise<GenerateCharacterResponse> {
  const modules = storyModules ?? DEFAULT_STORY_MODULES
  const responseSchema = buildGenerateCharacterResponseSchema(modules)
  const llmStrings = getLlmStrings()
  const availableTraitsLine = formatTemplate(llmStrings.generateCharacter.availableTraitsLine, {
    npcTraits: npcTraits.join(", "),
  })
  const prompt = getGenerateCharacterPrompt(modules)
  const result = await callLLMRaw(
    [
      {
        role: "system",
        content: `${prompt}\n\n${availableTraitsLine}`,
      },
      {
        role: "user",
        content: formatTemplate(llmStrings.generateCharacter.userPrompt, { description }),
      },
    ],
    "GenerateCharacterResponse",
    responseSchema,
    undefined,
    { disableRepetition: true, ...(options.onPreviewPatch ? { onPreviewPatch: options.onPreviewPatch } : {}) },
  )
  return result
}

type CharacterGenerationContext = {
  name: string
  race: string
  gender: string
  baseline_appearance: string
  current_appearance: string
  current_clothing: string
  personality_traits: string[]
  major_flaws: string[]
  perks: string[]
}

function formatCharacterContext(context: CharacterGenerationContext, part: "appearance" | "traits" | "clothing") {
  const llmStrings = getLlmStrings()
  const defaults = getServerDefaults()
  const labels = llmStrings.characterContextLabels
  const unknown = defaults.unknown.value
  const noneTitle = defaults.format.noneTitle
  const lines = [
    formatTemplate(labels.name, { value: context.name || unknown }),
    formatTemplate(labels.race, { value: context.race || unknown }),
    formatTemplate(labels.gender, { value: context.gender || unknown }),
  ]

  if (part === "traits") {
    const appearance = [context.baseline_appearance, context.current_appearance, context.current_clothing]
      .map((v) => v.trim())
      .filter(Boolean)
      .join(" | ")
    lines.push(formatTemplate(labels.appearance, { value: appearance || unknown }))
  } else if (part === "appearance") {
    lines.push(formatTemplate(labels.personalityTraits, { value: context.personality_traits.join(", ") || unknown }))
    lines.push(formatTemplate(labels.majorFlaws, { value: context.major_flaws.join(", ") || noneTitle }))
    lines.push(formatTemplate(labels.perks, { value: context.perks.join(", ") || noneTitle }))
  } else {
    lines.push(
      formatTemplate(labels.baselineAppearance, {
        value: context.baseline_appearance.trim() || unknown,
      }),
    )
    lines.push(formatTemplate(labels.currentAppearance, { value: context.current_appearance.trim() || unknown }))
    lines.push(formatTemplate(labels.personalityTraits, { value: context.personality_traits.join(", ") || unknown }))
    lines.push(formatTemplate(labels.majorFlaws, { value: context.major_flaws.join(", ") || noneTitle }))
    lines.push(formatTemplate(labels.perks, { value: context.perks.join(", ") || noneTitle }))
  }

  return lines.join("\n")
}

export async function generateCharacterPart(
  part: "appearance" | "traits" | "clothing",
  context: CharacterGenerationContext,
  storyModules?: StoryModules,
  options: { onPreviewPatch?: (patch: Record<string, unknown>) => void } = {},
): Promise<GenerateCharacterAppearanceResponse | GenerateCharacterTraitsResponse | GenerateCharacterClothingResponse> {
  const responseSchema =
    part === "appearance"
      ? GenerateCharacterAppearanceResponseSchema
      : part === "traits"
        ? GenerateCharacterTraitsResponseSchema
        : GenerateCharacterClothingResponseSchema

  const modules = storyModules ?? DEFAULT_STORY_MODULES
  const llmStrings = getLlmStrings()
  const availableTraitsLine = formatTemplate(llmStrings.generateCharacter.availableTraitsLine, {
    npcTraits: npcTraits.join(", "),
  })
  const prompt = [getGenerateCharacterPrompt(modules), availableTraitsLine].filter(Boolean).join("\n\n")
  const userContent = [
    formatTemplate(llmStrings.generateCharacterPart.regenerate, { part }),
    llmStrings.generateCharacterPart.contextHeader,
    formatCharacterContext(context, part),
    llmStrings.generateCharacterPart.instruction,
    part === "appearance"
      ? llmStrings.generateCharacterPart.avoid.appearance
      : part === "traits"
        ? llmStrings.generateCharacterPart.avoid.traits
        : llmStrings.generateCharacterPart.avoid.clothing,
  ].join("\n")

  const result = await callLLMRaw(
    [
      { role: "system", content: prompt },
      { role: "user", content: userContent },
    ],
    part === "appearance"
      ? "GenerateCharacterAppearanceResponse"
      : part === "traits"
        ? "GenerateCharacterTraitsResponse"
        : "GenerateCharacterClothingResponse",
    responseSchema,
    undefined,
    { disableRepetition: true, ...(options.onPreviewPatch ? { onPreviewPatch: options.onPreviewPatch } : {}) },
  )

  return result
}
