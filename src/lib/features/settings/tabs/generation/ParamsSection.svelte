<script lang="ts">
  import type { ModelInfo } from "@/types/api"
  import ParamsBasicSection from "@/features/settings/tabs/generation/ParamsBasicSection.svelte"

  type Props = {
    modelSearchResults?: ModelInfo[]
  }

  let { modelSearchResults = [] }: Props = $props()
</script>

<ParamsBasicSection {modelSearchResults} />
