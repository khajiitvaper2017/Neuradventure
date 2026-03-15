<script lang="ts">
  import { Tabs } from "bits-ui"
  import { cn } from "@/utils.js"

  let { ref = $bindable(null), value = $bindable(""), class: className, ...restProps }: Tabs.RootProps = $props()
</script>

<Tabs.Root bind:ref bind:value data-slot="tabs" class={cn("flex flex-col gap-2", className)} {...restProps} />
