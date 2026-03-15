<script lang="ts">
  import type { ModelInfo } from "@/shared/api-types"
  import ConnectionSection from "@/features/settings/tabs/generation/ConnectionSection.svelte"
  import ParamsSection from "@/features/settings/tabs/generation/ParamsSection.svelte"

  type Props = {
    active?: boolean
  }

  let { active = false }: Props = $props()

  let modelSearchResults = $state<ModelInfo[]>([])
</script>

<ConnectionSection {active} bind:modelSearchResults />
<ParamsSection {modelSearchResults} />
