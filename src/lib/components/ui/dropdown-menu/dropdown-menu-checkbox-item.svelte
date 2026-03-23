<script lang="ts">
  import { DropdownMenu } from "bits-ui"
  import { Check, Minus } from "@lucide/svelte"
  import { cn, type WithoutChildrenOrChild } from "@/utils.js"
  import type { Snippet } from "svelte"

  let {
    ref = $bindable(null),
    checked = $bindable(false),
    indeterminate = $bindable(false),
    class: className,
    children: childrenProp,
    ...restProps
  }: WithoutChildrenOrChild<DropdownMenu.CheckboxItemProps> & {
    children?: Snippet
  } = $props()
</script>

<DropdownMenu.CheckboxItem
  bind:ref
  bind:checked
  bind:indeterminate
  data-slot="dropdown-menu-checkbox-item"
  class={cn(
    "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 ps-8 pe-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    className,
  )}
  {...restProps}
>
  {#snippet children({ checked, indeterminate })}
    <span class="pointer-events-none absolute start-2 flex size-3.5 items-center justify-center">
      {#if indeterminate}
        <Minus class="size-4" />
      {:else}
        <Check class={cn("size-4", !checked && "text-transparent")} />
      {/if}
    </span>
    {@render childrenProp?.()}
  {/snippet}
</DropdownMenu.CheckboxItem>
