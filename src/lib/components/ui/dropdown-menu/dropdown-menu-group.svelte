<script lang="ts">
  import { DropdownMenu } from "bits-ui"
  let { ref = $bindable(null), ...restProps }: DropdownMenu.GroupProps = $props()
</script>

<DropdownMenu.Group bind:ref data-slot="dropdown-menu-group" {...restProps} />
