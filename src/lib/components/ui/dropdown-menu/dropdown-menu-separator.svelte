<script lang="ts">
  import { DropdownMenu } from "bits-ui"
  import { cn } from "@/utils.js"

  let { ref = $bindable(null), class: className, ...restProps }: DropdownMenu.SeparatorProps = $props()
</script>

<DropdownMenu.Separator
  bind:ref
  data-slot="dropdown-menu-separator"
  class={cn("bg-border -mx-1 my-1 h-px", className)}
  {...restProps}
/>
