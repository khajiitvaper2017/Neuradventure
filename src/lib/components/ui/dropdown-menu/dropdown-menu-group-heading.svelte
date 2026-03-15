<script lang="ts">
  import { DropdownMenu } from "bits-ui"
  import { cn } from "@/utils.js"
  import type { ComponentProps } from "svelte"

  let {
    ref = $bindable(null),
    class: className,
    inset,
    ...restProps
  }: ComponentProps<typeof DropdownMenu.GroupHeading> & {
    inset?: boolean
  } = $props()
</script>

<DropdownMenu.GroupHeading
  bind:ref
  data-slot="dropdown-menu-group-heading"
  data-inset={inset}
  class={cn("px-2 py-1.5 text-sm font-semibold data-[inset]:ps-8", className)}
  {...restProps}
/>
