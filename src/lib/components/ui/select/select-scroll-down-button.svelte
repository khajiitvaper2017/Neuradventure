<script lang="ts">
  import { ChevronDown } from "@lucide/svelte"
  import { Select } from "bits-ui"
  import { cn, type WithoutChildrenOrChild } from "@/utils.js"

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<Select.ScrollDownButtonProps> = $props()
</script>

<Select.ScrollDownButton
  bind:ref
  data-slot="select-scroll-down-button"
  class={cn("flex cursor-default items-center justify-center py-1", className)}
  {...restProps}
>
  <ChevronDown class="size-4" />
</Select.ScrollDownButton>
