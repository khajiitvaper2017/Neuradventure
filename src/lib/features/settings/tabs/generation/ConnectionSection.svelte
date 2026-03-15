<script lang="ts">
  import type { ModelInfo } from "@/shared/api-types"
  import ConnectorSection from "@/features/settings/tabs/generation/ConnectorSection.svelte"

  type Props = {
    active?: boolean
    modelSearchResults: ModelInfo[]
  }

  let { active = false, modelSearchResults = $bindable() }: Props = $props()
</script>

<ConnectorSection {active} bind:modelSearchResults />
