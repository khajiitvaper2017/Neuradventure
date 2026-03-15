<script lang="ts">
  import { AlertDialog } from "bits-ui"
  let { ...restProps }: AlertDialog.PortalProps = $props()
</script>

<AlertDialog.Portal {...restProps} />
