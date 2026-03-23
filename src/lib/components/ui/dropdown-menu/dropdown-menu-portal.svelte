<script lang="ts">
  import { DropdownMenu } from "bits-ui"
  let { ...restProps }: DropdownMenu.PortalProps = $props()
</script>

<DropdownMenu.Portal {...restProps} />
