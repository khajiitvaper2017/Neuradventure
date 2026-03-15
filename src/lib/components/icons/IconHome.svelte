<script lang="ts">
  import { House } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 1.8
  export let className = ""
</script>

<House class={className} {size} {strokeWidth} aria-hidden="true" />
