<script lang="ts">
  import type { ModelInfo } from "@/shared/api-types"
  import ConnectionSection from "@/features/settings/tabs/generation/ConnectionSection.svelte"
  import StoryDefaultsSection from "@/features/settings/tabs/generation/StoryDefaultsSection.svelte"
  import SamplerPresetsSection from "@/features/settings/tabs/generation/SamplerPresetsSection.svelte"
  import ParamsBasicSection from "@/features/settings/tabs/generation/ParamsBasicSection.svelte"
  import ParamsAdvancedSection from "@/features/settings/tabs/generation/ParamsAdvancedSection.svelte"
  import TimeoutsSection from "@/features/settings/tabs/generation/TimeoutsSection.svelte"
  import { isChatGenerating } from "@/stores/chat"
  import { isGenerating } from "@/stores/game"

  export type GenerationSection = "connection" | "defaults" | "params" | "advanced"

  type Props = {
    active?: boolean
    section: GenerationSection
  }

  let { active = false, section }: Props = $props()

  let modelSearchResults = $state<ModelInfo[]>([])

  let generationLockActive = $derived($isGenerating || $isChatGenerating)
</script>

{#if section === "connection"}
  <ConnectionSection {active} bind:modelSearchResults />
{:else if section === "defaults"}
  <StoryDefaultsSection />
{:else if section === "advanced"}
  <TimeoutsSection disabled={generationLockActive} />
  <ParamsAdvancedSection {modelSearchResults} />
{:else}
  <SamplerPresetsSection {active} />
  <ParamsBasicSection {modelSearchResults} />
{/if}
