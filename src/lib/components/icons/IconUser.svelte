<script lang="ts">
  import { User } from "@lucide/svelte"

  export let size = 16
  export let strokeWidth = 1.8
  export let className = ""
</script>

<User class={className} {size} {strokeWidth} aria-hidden="true" />
