<script lang="ts">
  import type { ModelInfo } from "../../../api/client.js"
  import ConnectionSection from "./generation/ConnectionSection.svelte"
  import ParamsSection from "./generation/ParamsSection.svelte"

  type Props = {
    active?: boolean
  }

  let { active = false }: Props = $props()

  let modelSearchResults = $state<ModelInfo[]>([])
</script>

<ConnectionSection {active} bind:modelSearchResults />
<ParamsSection {modelSearchResults} />
