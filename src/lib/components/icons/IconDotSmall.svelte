<script lang="ts">
  import { Dot } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 1.8
  export let className = ""
</script>

<Dot class={className} {size} {strokeWidth} aria-hidden="true" />
