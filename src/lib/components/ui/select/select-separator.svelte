<script lang="ts">
  import { Separator } from "@/components/ui/separator/index.js"
  import { cn } from "@/utils.js"

  let { ref = $bindable(null), class: className, ...restProps }: import("bits-ui").Separator.RootProps = $props()
</script>

<Separator
  bind:ref
  data-slot="select-separator"
  class={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
  {...restProps}
/>
