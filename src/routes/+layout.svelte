<script lang="ts">
  import AppShell from "@/features/app/AppShell.svelte"

  let { children } = $props()
</script>

<AppShell {children} />
