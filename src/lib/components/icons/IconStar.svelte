<script lang="ts">
  import { Star } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 1.8
  export let className = ""
</script>

<Star class={className} {size} {strokeWidth} aria-hidden="true" />
