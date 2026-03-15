<script lang="ts">
  import { LoaderCircle } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 2.2
  export let className = ""
</script>

<LoaderCircle class={className} {size} {strokeWidth} aria-hidden="true" />
