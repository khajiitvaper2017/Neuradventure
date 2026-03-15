<script lang="ts">
  import { Select } from "bits-ui"
  let { ...restProps }: Select.PortalProps = $props()
</script>

<Select.Portal {...restProps} />
