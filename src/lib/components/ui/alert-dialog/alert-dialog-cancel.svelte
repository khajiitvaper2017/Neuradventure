<script lang="ts">
  import { AlertDialog } from "bits-ui"
  import { buttonVariants } from "@/components/ui/button/index.js"
  import { cn } from "@/utils.js"

  let { ref = $bindable(null), class: className, ...restProps }: AlertDialog.CancelProps = $props()
</script>

<AlertDialog.Cancel
  bind:ref
  data-slot="alert-dialog-cancel"
  class={cn(buttonVariants({ variant: "outline" }), className)}
  {...restProps}
/>
