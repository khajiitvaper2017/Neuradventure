<script lang="ts">
  import { Select } from "bits-ui"
  let { open = $bindable(false), value = $bindable(), ...restProps }: Select.RootProps = $props()
</script>

<Select.Root bind:open bind:value={value as never} {...restProps} />
