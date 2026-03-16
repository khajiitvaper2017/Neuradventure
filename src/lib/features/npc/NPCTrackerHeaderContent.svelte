<script lang="ts">
  import { Users } from "@lucide/svelte"
  import { Button } from "@/components/ui/button"

  let {
    count,
    useNpcAppearance = true,
    showBaselineDetails = false,
    disableBaselineToggle = false,
    showClose = false,
    onToggleBaseline,
    onClose,
  }: {
    count: number
    useNpcAppearance?: boolean
    showBaselineDetails?: boolean
    disableBaselineToggle?: boolean
    showClose?: boolean
    onToggleBaseline: () => void
    onClose?: () => void
  } = $props()
</script>

<div class="flex w-full items-center gap-2">
  <Users size={16} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
  <span class="min-w-0 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
    Known NPCs ({count})
  </span>
  <div class="ml-auto flex items-center gap-2">
    {#if useNpcAppearance}
      <Button
        variant="outline"
        size="sm"
        class="h-8 rounded-full px-3"
        onclick={onToggleBaseline}
        disabled={disableBaselineToggle}
      >
        {showBaselineDetails ? "Hide Baseline" : "Show Baseline"}
      </Button>
    {/if}
    {#if showClose}
      <Button variant="ghost" size="icon" class="h-9 w-9" onclick={onClose} aria-label="Close">×</Button>
    {/if}
  </div>
</div>
