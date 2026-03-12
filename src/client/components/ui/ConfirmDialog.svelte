<script lang="ts">
  import { confirmDialog, resolveConfirm } from "../../stores/ui.js"

  function onKeydown(e: KeyboardEvent) {
    if (!$confirmDialog) return
    if (e.key === "Escape") {
      e.preventDefault()
      resolveConfirm(false)
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if $confirmDialog}
  <div class="confirm-overlay" onclick={() => resolveConfirm(false)} role="presentation">
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="confirm-box" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
      <h3 class="confirm-title">{$confirmDialog.title}</h3>
      <p class="confirm-message">{$confirmDialog.message}</p>
      <div class="confirm-actions">
        <button class="btn-ghost" onclick={() => resolveConfirm(false)}>Cancel</button>
        <button class={$confirmDialog.danger ? "btn-danger" : "btn-accent"} onclick={() => resolveConfirm(true)}>
          {$confirmDialog.confirmLabel || "Confirm"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease;
  }
  .confirm-box {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 1.5rem;
    max-width: min(88vw, 360px);
    width: 100%;
    animation: boxIn 0.15s ease;
  }
  .confirm-title {
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 0.5rem;
  }
  .confirm-message {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--text-dim);
    line-height: 1.5;
    margin: 0 0 1.25rem;
  }
  .confirm-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .confirm-actions .btn-ghost,
  .confirm-actions .btn-accent,
  .confirm-actions .btn-danger {
    padding: 0.5rem 1rem;
    min-height: 36px;
    font-size: 0.82rem;
  }
  .btn-danger {
    background: var(--danger);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-ui);
    font-weight: 600;
    transition: opacity 0.15s;
  }
  .btn-danger:hover {
    opacity: 0.85;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes boxIn {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
