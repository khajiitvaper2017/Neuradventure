<script lang="ts">
  import { pwa, clearPwaNeedRefresh } from "@/stores/pwa"
  import { Button } from "@/components/ui/button"

  async function applyUpdate() {
    const state = $pwa
    try {
      await state.updateServiceWorker?.(true)
    } finally {
      clearPwaNeedRefresh()
    }
  }
</script>

{#if $pwa.needRefresh}
  <div
    class="fixed bottom-[calc(12px+env(safe-area-inset-bottom))] left-3 right-3 z-[250] flex items-center justify-between gap-3 rounded-xl border bg-background/85 p-3.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:left-auto sm:right-4 sm:w-[min(560px,92vw)]"
    role="status"
    aria-live="polite"
  >
    <div class="min-w-0">
      <div class="truncate text-sm font-semibold text-foreground">Update available</div>
      <div class="mt-0.5 truncate text-xs text-muted-foreground">Reload to get the latest version.</div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <Button size="sm" onclick={applyUpdate}>Update</Button>
      <Button size="sm" variant="outline" onclick={clearPwaNeedRefresh}>Later</Button>
    </div>
  </div>
{/if}
