import { type NPCState, type StoryModules } from "@/types/models"
import type { GenerateStoryResponse } from "@/types/api"
import type { ZodType } from "zod"
import { callLLMRaw } from "@/llm/call"
import { getGenerateStoryPrompt } from "@/llm/config"
import { buildLlmContract } from "@/llm/contract"
import { formatTemplate, getLlmStrings, getServerDefaults } from "@/utils/text/strings"
import { DEFAULT_STORY_MODULES, resolveModuleFlags } from "@/domain/story/schemas/story-modules"

export async function generateStory(
  description: string,
  character: {
    name: string
    race: string
    gender: string
    general_description?: string
    current_location?: string
    current_activity?: string
    baseline_appearance?: string
    current_appearance?: string
    current_clothing?: string
    personality_traits?: string[]
    major_flaws?: string[]
    perks?: string[]
  },
  storyModules?: StoryModules,
  options: {
    onPreviewPatch?: (patch: Record<string, unknown>) => void
    selectedNpcs?: NPCState[]
  } = {},
): Promise<GenerateStoryResponse> {
  const modules = storyModules ?? DEFAULT_STORY_MODULES
  const flags = resolveModuleFlags(modules)
  const selectedNpcs = options.selectedNpcs ?? []
  const selectedNpcNames = selectedNpcs.map((npc) => npc.name)
  const contract = buildLlmContract("story_setup", {
    modules,
    playerName: character.name,
    knownNpcNames: selectedNpcNames,
  })
  const responseSchema = contract.zodSchema as ZodType<GenerateStoryResponse>
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

  const missingTokens = new Set(
    [
      unknown,
      defaults.unknown.location,
      defaults.unknown.activity,
      defaults.unknown.appearance,
      defaults.unknown.clothing,
      defaults.unknown.baselineAppearance,
    ]
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  )
  const isMissingText = (value: string | undefined) => {
    const trimmed = (value ?? "").trim()
    if (!trimmed) return true
    const key = trimmed.toLowerCase()
    return missingTokens.has(key) || key.startsWith("unknown")
  }

  const selectedNpcContent =
    selectedNpcs.length === 0
      ? ""
      : [
          "",
          "User-selected NPCs (from library; already exist in this story):",
          "Do NOT include these NPCs in character_introductions. Only generate additional NPCs not listed here.",
          'If any user-selected NPC is missing or needs setup changes, return those values in a root-level object keyed by that exact name, for example: "Eliza": { "current_activity": "..." }.',
          ...selectedNpcs.map((npc) => {
            const name = (npc.name ?? "").trim() || unknown
            const race = (npc.race ?? "").trim() || unknown
            const gender = (npc.gender ?? "").trim() || unknown
            const desc = (npc.general_description ?? "").trim() || defaults.unknown.generalDescription
            const parts: string[] = []
            parts.push(`- ${name} (${race}, ${gender}) — ${desc}`)
            if (flags.useNpcLocation) {
              parts.push(
                `  current_location: ${isMissingText(npc.current_location) ? "(missing)" : (npc.current_location ?? "").trim()}`,
              )
            }
            if (flags.useNpcActivity) {
              parts.push(
                `  current_activity: ${isMissingText(npc.current_activity) ? "(missing)" : (npc.current_activity ?? "").trim()}`,
              )
            }
            if (flags.useNpcAppearance) {
              parts.push(
                `  baseline_appearance: ${isMissingText(npc.baseline_appearance) ? "(missing)" : (npc.baseline_appearance ?? "").trim()}`,
              )
              parts.push(
                `  current_appearance: ${isMissingText(npc.current_appearance) ? "(missing)" : (npc.current_appearance ?? "").trim()}`,
              )
              parts.push(
                `  current_clothing: ${isMissingText(npc.current_clothing) ? "(missing)" : (npc.current_clothing ?? "").trim()}`,
              )
            }
            return parts.join("\n")
          }),
          "",
        ].join("\n")
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
          ...(flags.useCharActivity
            ? [
                formatTemplate(llmStrings.characterContextLabels.currentActivity, {
                  value: character.current_activity || unknown,
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
          selectedNpcContent,
          formatTemplate(llmStrings.generateStory.storyDescription, { description }),
        ].join("\n"),
      },
    ],
    "GenerateStoryResponse",
    responseSchema,
    undefined,
    {
      disableRepetition: true,
      previewKeys: contract.previewKeys,
      ...(options.onPreviewPatch ? { onPreviewPatch: options.onPreviewPatch } : {}),
    },
  )
  return result
}
