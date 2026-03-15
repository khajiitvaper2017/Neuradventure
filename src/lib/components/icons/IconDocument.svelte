<script lang="ts">
  import { FileText } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 1.8
  export let className = ""
</script>

<FileText class={className} {size} {strokeWidth} aria-hidden="true" />
