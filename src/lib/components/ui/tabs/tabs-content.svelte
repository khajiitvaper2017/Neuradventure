<script lang="ts">
  import { Tabs } from "bits-ui"
  import { cn } from "@/utils.js"

  let { ref = $bindable(null), class: className, ...restProps }: Tabs.ContentProps = $props()
</script>

<Tabs.Content bind:ref data-slot="tabs-content" class={cn("flex-1 outline-none", className)} {...restProps} />
