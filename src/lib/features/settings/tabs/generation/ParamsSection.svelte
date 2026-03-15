<script lang="ts">
  import type { ModelInfo } from "@/shared/api-types"
  import ParamsBasicSection from "@/features/settings/tabs/generation/ParamsBasicSection.svelte"

  type Props = {
    modelSearchResults?: ModelInfo[]
  }

  let { modelSearchResults = [] }: Props = $props()
</script>

<ParamsBasicSection {modelSearchResults} />
