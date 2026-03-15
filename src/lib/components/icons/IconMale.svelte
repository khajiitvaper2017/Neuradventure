<script lang="ts">
  import { Mars } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 1.8
  export let className = ""
</script>

<Mars class={className} {size} {strokeWidth} aria-hidden="true" />
