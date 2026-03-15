<script lang="ts">
  import { ScrollArea } from "bits-ui"
  import { Scrollbar } from "./index.js"
  import { cn, type WithoutChild } from "@/utils.js"

  let {
    ref = $bindable(null),
    viewportRef = $bindable(null),
    class: className,
    orientation = "vertical",
    scrollbarXClasses = "",
    scrollbarYClasses = "",
    children,
    ...restProps
  }: WithoutChild<ScrollArea.RootProps> & {
    orientation?: "vertical" | "horizontal" | "both" | undefined
    scrollbarXClasses?: string | undefined
    scrollbarYClasses?: string | undefined
    viewportRef?: HTMLElement | null
  } = $props()
</script>

<ScrollArea.Root bind:ref data-slot="scroll-area" class={cn("relative", className)} {...restProps}>
  <ScrollArea.Viewport
    bind:ref={viewportRef}
    data-slot="scroll-area-viewport"
    class="ring-ring/10 dark:ring-ring/20 dark:outline-ring/40 outline-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] focus-visible:ring-4 focus-visible:outline-1"
  >
    {@render children?.()}
  </ScrollArea.Viewport>
  {#if orientation === "vertical" || orientation === "both"}
    <Scrollbar orientation="vertical" class={scrollbarYClasses} />
  {/if}
  {#if orientation === "horizontal" || orientation === "both"}
    <Scrollbar orientation="horizontal" class={scrollbarXClasses} />
  {/if}
  <ScrollArea.Corner />
</ScrollArea.Root>
