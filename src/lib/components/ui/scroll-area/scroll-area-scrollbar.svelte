<script lang="ts">
  import { ScrollArea } from "bits-ui"
  import { cn, type WithoutChild } from "@/utils.js"

  let {
    ref = $bindable(null),
    class: className,
    orientation = "vertical",
    children,
    ...restProps
  }: WithoutChild<ScrollArea.ScrollbarProps> = $props()
</script>

<ScrollArea.Scrollbar
  bind:ref
  data-slot="scroll-area-scrollbar"
  {orientation}
  class={cn(
    "flex touch-none p-px transition-colors select-none",
    orientation === "vertical" && "h-full w-2.5 border-s border-s-transparent",
    orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
  <ScrollArea.Thumb data-slot="scroll-area-thumb" class="bg-border relative flex-1 rounded-full" />
</ScrollArea.Scrollbar>
