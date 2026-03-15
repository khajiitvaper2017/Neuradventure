<script lang="ts">
  import { EllipsisVertical } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 2
  export let className = ""
</script>

<EllipsisVertical class={className} {size} {strokeWidth} aria-hidden="true" />
