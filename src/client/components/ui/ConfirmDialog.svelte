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
  <div
    class="overlay overlay--modal"
    onclick={(e) => {
      if (e.currentTarget !== e.target) return
      resolveConfirm(false)
    }}
    role="presentation"
  >
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal" role="dialog" aria-modal="true" tabindex="-1">
      <h3 class="modal__title">{$confirmDialog.title}</h3>
      <p class="modal__message">{$confirmDialog.message}</p>
      <div class="modal__actions">
        <button class="btn-ghost small" onclick={() => resolveConfirm(false)}>Cancel</button>
        <button
          class={$confirmDialog.danger ? "btn-danger small" : "btn-accent small"}
          onclick={() => resolveConfirm(true)}
        >
          {$confirmDialog.confirmLabel || "Confirm"}
        </button>
      </div>
    </div>
  </div>
{/if}
