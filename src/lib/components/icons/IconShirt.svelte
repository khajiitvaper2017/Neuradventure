<script lang="ts">
  import { Shirt } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 1.8
  export let className = ""
</script>

<Shirt class={className} {size} {strokeWidth} aria-hidden="true" />
