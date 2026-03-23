<script lang="ts">
  import { Select } from "bits-ui"
  import { cn } from "@/utils.js"
  import type { ComponentProps } from "svelte"

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: ComponentProps<typeof Select.GroupHeading> = $props()
</script>

<Select.GroupHeading
  bind:ref
  data-slot="select-group-heading"
  class={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
  {...restProps}
>
  {@render children?.()}
</Select.GroupHeading>
