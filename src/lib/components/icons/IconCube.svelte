<script lang="ts">
  import { Box } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 1.8
  export let className = ""
</script>

<Box class={className} {size} {strokeWidth} aria-hidden="true" />
