<script lang="ts">
  import type { StoryModules } from "../../api/client.js"
  import StoryModulesPanel from "../../components/ui/StoryModulesPanel.svelte"

  export let open = false
  export let disabled = false
  export let modules: StoryModules

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
    <div class="modal modal--wide" role="dialog" aria-modal="true" aria-label="Story modules" tabindex="-1">
      <h3 class="modal__title">Story Modules</h3>
      <p class="modal__message">Control which mechanics are tracked for this story.</p>
      <div class="editor-body editor-body--modules" data-scroll-root="modal">
        <StoryModulesPanel {modules} setModules={(next) => (modules = next)} bare />
      </div>
      <div class="modal__actions">
        <button class="btn-ghost" onclick={onCancel} {disabled}>Cancel</button>
        <button class="btn-accent" onclick={onSave} {disabled}>Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .editor-body {
    min-height: 0;
  }
  .editor-body--modules {
    overflow-y: auto;
    padding: 0.3rem 0.8rem;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
</style>
