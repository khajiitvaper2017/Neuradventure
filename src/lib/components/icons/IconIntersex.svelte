<script lang="ts">
  import { VenusAndMars } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 1.8
  export let className = ""
</script>

<VenusAndMars class={className} {size} {strokeWidth} aria-hidden="true" />
