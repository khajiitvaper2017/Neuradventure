<script lang="ts">
  import { autoresize } from "@/utils/actions/autoresize"

  export let open = false
  export let disabled = false
  export let draft = ""

  export let onCancel: (() => void) | undefined = undefined
  export let onSave: (() => void) | undefined = undefined

  function onBackdropClick(e: MouseEvent) {
    if (disabled) return
    const el = e.currentTarget
    if (!(el instanceof HTMLElement)) return
    if (el !== e.target) return
    onCancel?.()
  }

  function onKeydown(e: KeyboardEvent) {
    if (!open) return
    if (disabled) return
    if (e.key === "Escape") {
      e.preventDefault()
      onCancel?.()
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay overlay--modal" onclick={onBackdropClick}>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Memory" tabindex="-1">
      <h3 class="modal__title">Memory</h3>
      <p class="modal__message">Persistent summary — updated by AI each turn, editable by you.</p>
      <textarea class="edit-textarea" bind:value={draft} rows="6" {disabled} use:autoresize={draft}></textarea>
      <div class="modal__actions">
        <button class="btn-ghost" onclick={onCancel} {disabled}>Cancel</button>
        <button class="btn-accent" onclick={onSave} {disabled}>Save</button>
      </div>
    </div>
  </div>
{/if}
