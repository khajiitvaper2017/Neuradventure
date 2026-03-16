<script lang="ts">
  import AppShell from "@/features/app/AppShell.svelte"
  import { Toaster } from "$lib/components/ui/sonner/index.js"
  import { ModeWatcher } from "mode-watcher"
  let { children } = $props()
</script>

<Toaster />
<ModeWatcher />
<AppShell {children} />
