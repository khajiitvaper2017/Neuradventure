<script lang="ts">
  import { Trash } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 2
  export let className = ""
</script>

<Trash class={className} {size} {strokeWidth} aria-hidden="true" />
