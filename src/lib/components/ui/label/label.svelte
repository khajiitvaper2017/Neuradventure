<script lang="ts">
  import { Label } from "bits-ui"
  import { cn } from "@/utils.js"

  let { ref = $bindable(null), class: className, ...restProps }: Label.RootProps = $props()
</script>

<Label.Root
  bind:ref
  data-slot="label"
  class={cn(
    "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
    className,
  )}
  {...restProps}
/>
