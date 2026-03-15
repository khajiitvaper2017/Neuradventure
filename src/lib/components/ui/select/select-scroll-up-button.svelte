<script lang="ts">
  import { ChevronUp } from "@lucide/svelte"
  import { Select } from "bits-ui"
  import { cn, type WithoutChildrenOrChild } from "@/utils.js"

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<Select.ScrollUpButtonProps> = $props()
</script>

<Select.ScrollUpButton
  bind:ref
  data-slot="select-scroll-up-button"
  class={cn("flex cursor-default items-center justify-center py-1", className)}
  {...restProps}
>
  <ChevronUp class="size-4" />
</Select.ScrollUpButton>
