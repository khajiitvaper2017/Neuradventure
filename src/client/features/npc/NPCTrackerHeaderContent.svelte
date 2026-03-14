<script lang="ts">
  import IconUsers from "../../components/icons/IconUsers.svelte"

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

<IconUsers size={16} strokeWidth={1.5} className="npc-header-icon" />
<span>Known NPCs ({count})</span>
{#if useNpcAppearance}
  <button class="btn-ghost small" onclick={onToggleBaseline} disabled={disableBaselineToggle}>
    {showBaselineDetails ? "Hide Baseline" : "Show Baseline"}
  </button>
{/if}
{#if showClose}
  <button class="panel-close" onclick={onClose} aria-label="Close">×</button>
{/if}
