<script lang="ts">
  import AppShell from "@/features/app/AppShell.svelte"
  import { ModeWatcher } from "mode-watcher";
  let { children } = $props()
</script>

<ModeWatcher />
<AppShell {children} />
