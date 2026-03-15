<script lang="ts">
  import { Send } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 2.2
  export let className = ""
</script>

<Send class={className} {size} {strokeWidth} aria-hidden="true" />
