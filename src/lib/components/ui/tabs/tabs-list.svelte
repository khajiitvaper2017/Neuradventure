<script lang="ts">
  import { Tabs } from "bits-ui"
  import { cn } from "@/utils.js"

  let { ref = $bindable(null), class: className, ...restProps }: Tabs.ListProps = $props()
</script>

<Tabs.List
  bind:ref
  data-slot="tabs-list"
  class={cn(
    "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
    className,
  )}
  {...restProps}
/>
