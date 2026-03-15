<script lang="ts">
  import { Venus } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 1.8
  export let className = ""
</script>

<Venus class={className} {size} {strokeWidth} aria-hidden="true" />
