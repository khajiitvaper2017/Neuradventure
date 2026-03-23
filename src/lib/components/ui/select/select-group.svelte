<script lang="ts">
  import { Select } from "bits-ui"
  let { ref = $bindable(null), ...restProps }: Select.GroupProps = $props()
</script>

<Select.Group bind:ref data-slot="select-group" {...restProps} />
