<script lang="ts">
  import { SquarePen } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 2
  export let className = ""
</script>

<SquarePen class={className} {size} {strokeWidth} aria-hidden="true" />
