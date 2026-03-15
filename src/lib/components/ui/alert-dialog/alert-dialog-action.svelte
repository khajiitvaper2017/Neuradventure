<script lang="ts">
  import { AlertDialog } from "bits-ui"
  import { buttonVariants } from "@/components/ui/button/index.js"
  import { cn } from "@/utils.js"

  let { ref = $bindable(null), class: className, ...restProps }: AlertDialog.ActionProps = $props()
</script>

<AlertDialog.Action bind:ref data-slot="alert-dialog-action" class={cn(buttonVariants(), className)} {...restProps} />
