<script lang="ts">
  import { MapPin } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 1.8
  export let className = ""
</script>

<MapPin class={className} {size} {strokeWidth} aria-hidden="true" />
