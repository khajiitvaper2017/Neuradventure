import traits from "../../../../shared/config/traits.json"

export const npcTraits: string[] = (traits as unknown as string[]) ?? []
export const npcTraitEnumValues = npcTraits.map((trait) => trait.trim()).filter((trait) => trait.length > 0)
export const npcTraitLookup = new Map(npcTraitEnumValues.map((trait) => [trait.toLowerCase(), trait]))
