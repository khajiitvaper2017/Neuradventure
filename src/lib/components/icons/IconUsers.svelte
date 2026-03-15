<script lang="ts">
  import { Users } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 1.8
  export let className = ""
</script>

<Users class={className} {size} {strokeWidth} aria-hidden="true" />
