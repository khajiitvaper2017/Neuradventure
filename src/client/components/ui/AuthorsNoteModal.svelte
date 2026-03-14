<script lang="ts">
  import { autoresize } from "../../utils/actions/autoresize.js"

  export let open = false
  export let disabled = false

  export let note = ""
  export let position = 1
  export let depth = 4
  export let interval = 1
  export let role = 0
  export let embedState = false

  export let onCancel: (() => void) | undefined = undefined
  export let onSave: (() => void) | undefined = undefined

  function onBackdropClick(e: MouseEvent) {
    if (disabled) return
    const el = e.currentTarget
    if (!(el instanceof HTMLElement)) return
    if (el !== e.target) return
    onCancel?.()
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay overlay--modal" onclick={onBackdropClick}>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Author's note" tabindex="-1">
      <h3 class="modal__title">Author's Note</h3>
      <p class="modal__message">Injected into the prompt using SillyTavern-style position/depth rules.</p>

      <textarea
        class="edit-textarea"
        bind:value={note}
        rows="4"
        placeholder="e.g. Focus on dialogue and character emotions"
        {disabled}
        use:autoresize={note}
      ></textarea>

      <div class="meta-grid" role="group" aria-label="Author's note injection settings">
        <div class="meta-row">
          <label class="meta-label" for="an-position">Position</label>
          <select id="an-position" bind:value={position} class="meta-input" {disabled}>
            <option value={2}>Before scenario</option>
            <option value={1}>In chat</option>
            <option value={0}>After scenario</option>
          </select>
        </div>

        <div class="meta-row">
          <label class="meta-label" for="an-depth">Depth</label>
          <input id="an-depth" type="number" min="0" max="100" bind:value={depth} class="meta-input" {disabled} />
        </div>

        <div class="meta-row">
          <label class="meta-label" for="an-interval">Interval</label>
          <input
            id="an-interval"
            type="number"
            min="0"
            max="1000"
            bind:value={interval}
            class="meta-input"
            {disabled}
          />
        </div>

        <div class="meta-row">
          <label class="meta-label" for="an-role">Role</label>
          <select id="an-role" bind:value={role} class="meta-input" {disabled}>
            <option value={0}>System</option>
            <option value={1}>User</option>
            <option value={2}>Assistant</option>
          </select>
        </div>

        <div class="meta-row meta-row--toggle">
          <label class="meta-label" for="an-embed">Embed state blocks</label>
          <input id="an-embed" type="checkbox" bind:checked={embedState} {disabled} />
        </div>
      </div>

      <div class="modal__actions">
        <button class="btn-ghost" onclick={() => onCancel?.()} {disabled}>Cancel</button>
        <button class="btn-accent" onclick={() => onSave?.()} {disabled}>Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .meta-grid {
    --an-gap: 0.5rem;
    --an-font: 0.82rem;
    --an-input-bg: var(--bg-input);
    --an-border: var(--border);
    --an-text: var(--text);
    --an-text-dim: var(--text-dim);

    display: grid;
    grid-template-columns: 1fr;
    gap: var(--an-gap);
    margin-top: 0.5rem;
    font-size: var(--an-font);
    color: var(--an-text-dim);
  }

  .meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--an-gap);
  }

  .meta-row--toggle {
    padding-top: 0.2rem;
    border-top: 1px solid var(--an-border);
  }

  .meta-label {
    min-width: 140px;
  }

  .meta-input {
    width: 180px;
    padding: 0.3rem 0.5rem;
    background: var(--an-input-bg);
    border: 1px solid var(--an-border);
    border-radius: 4px;
    color: var(--an-text);
    font-size: var(--an-font);
  }

  @media (max-width: 520px) {
    .meta-row {
      flex-direction: column;
      align-items: stretch;
    }

    .meta-label {
      min-width: 0;
    }

    .meta-input {
      width: 100%;
    }
  }
</style>
