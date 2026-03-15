<script lang="ts">
  import { Plus } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 2
  export let className = ""
</script>

<Plus class={className} {size} {strokeWidth} aria-hidden="true" />
