<script lang="ts">
  import { autoresize } from "../../utils/actions/autoresize.js"
  import Select from "./Select.svelte"

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

  const positionOptions = [
    { value: 2, label: "Before scenario" },
    { value: 1, label: "In chat" },
    { value: 0, label: "After scenario" },
  ]

  const roleOptions = [
    { value: 0, label: "System" },
    { value: 1, label: "User" },
    { value: 2, label: "Assistant" },
  ]

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
    <div class="modal" role="dialog" aria-modal="true" aria-label="Author's note" tabindex="-1">
      <h3 class="modal__title">Author's Note</h3>
      <p class="modal__message">Injected into the prompt using SillyTavern-style position/depth rules.</p>

      <div class="field">
        <label for="an-note">
          Note <span class="hint">(optional)</span>
        </label>
        <textarea
          id="an-note"
          class="edit-textarea"
          bind:value={note}
          rows="4"
          placeholder="e.g. Focus on dialogue and character emotions"
          {disabled}
          use:autoresize={note}
        ></textarea>
      </div>

      <div class="an-grid" role="group" aria-label="Author's note injection settings">
        <div class="field">
          <label for="an-position">Position</label>
          <Select
            id="an-position"
            ariaLabel="Author note position"
            width="100%"
            options={positionOptions}
            bind:value={position}
            {disabled}
          />
        </div>

        <div class="field">
          <label for="an-depth">Depth</label>
          <input
            id="an-depth"
            class="text-input text-input--fluid"
            type="number"
            min="0"
            max="100"
            bind:value={depth}
            {disabled}
          />
        </div>

        <div class="field">
          <label for="an-interval">Interval</label>
          <input
            id="an-interval"
            class="text-input text-input--fluid"
            type="number"
            min="0"
            max="1000"
            bind:value={interval}
            {disabled}
          />
          <div class="help-text">0 disables author note text injection.</div>
        </div>

        <div class="field">
          <label for="an-role">Role</label>
          <Select
            id="an-role"
            ariaLabel="Author note role"
            width="100%"
            options={roleOptions}
            bind:value={role}
            {disabled}
          />
        </div>

        <div class="field an-toggle">
          <div class="label-row">
            <label for="an-embed">Embed state blocks</label>
            <input id="an-embed" type="checkbox" bind:checked={embedState} {disabled} />
          </div>
          <div class="help-text">
            If enabled, state blocks (player/npc context) are placed inside the author note section.
          </div>
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
  .an-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .an-toggle {
    grid-column: 1 / -1;
    padding-top: 0.25rem;
    border-top: 1px solid var(--border);
  }

  @media (max-width: 560px) {
    .an-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
