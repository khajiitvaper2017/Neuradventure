<script lang="ts">
  import { DropdownMenu } from "bits-ui"
  let { open = $bindable(false), ...restProps }: DropdownMenu.SubProps = $props()
</script>

<DropdownMenu.Sub bind:open {...restProps} />
