<script lang="ts">
  import { autoresize } from "../../utils/actions/autoresize.js"
  import IconSend from "../icons/IconSend.svelte"
  import IconSpinner from "../icons/IconSpinner.svelte"

  export let value = ""
  export let placeholder = ""
  export let disabled = false
  export let canSend = true
  export let sending = false
  export let onSend: (() => void) | undefined = undefined
  export let onFocus: ((event: FocusEvent) => void) | undefined = undefined
  export let textareaEl: HTMLTextAreaElement | null = null
  export let rows = 2

  const canSubmit = () => !disabled && canSend

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (canSubmit()) onSend?.()
    }
  }

  function handleSend() {
    if (!canSubmit()) return
    onSend?.()
  }
</script>

<div class="input-zone conversation-input">
  <div class="mode-row">
    <div class="top-controls">
      <slot name="top-controls" />
    </div>
    <button class="send-btn" onclick={handleSend} disabled={!canSubmit()} aria-label="Send">
      {#if sending}
        <IconSpinner className="spin" size={16} strokeWidth={2.2} />
      {:else}
        <IconSend size={16} strokeWidth={2.2} />
      {/if}
    </button>
  </div>

  <textarea
    bind:this={textareaEl}
    bind:value
    {placeholder}
    {rows}
    {disabled}
    onkeydown={handleKeydown}
    onfocus={(event) => onFocus?.(event)}
    use:autoresize={value}
  ></textarea>

  {#if $$slots["bottom-controls"]}
    <div class="toolbar">
      <slot name="bottom-controls" />
    </div>
  {/if}
</div>

<style>
  .conversation-input {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }
  @media (min-width: 1200px) {
    .conversation-input {
      padding-left: 1.25rem;
      padding-right: 1.25rem;
      padding-bottom: 1.1rem;
    }
  }

  .mode-row {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0.35rem 0.75rem;
    border-bottom: 1px solid var(--border);
    min-height: 42px;
  }
  .top-controls {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex: 1;
    min-width: 0;
    flex-wrap: wrap;
  }
  .top-controls :global(> *) {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    flex-wrap: wrap;
  }

  .send-btn {
    margin-left: auto;
    background: var(--accent);
    border: none;
    color: #0d0b08;
    border-radius: 50%;
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      background 0.15s,
      opacity 0.15s;
    flex-shrink: 0;
  }
  .send-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .send-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  textarea {
    width: 100%;
    background: transparent;
    border: none;
    color: var(--text);
    font-family: var(--font-story);
    font-size: 0.95rem;
    line-height: 1.5;
    padding: 0.85rem 1.25rem 0.65rem;
    resize: none;
    display: block;
  }
  @media (min-width: 1200px) {
    textarea {
      padding-bottom: 1.25rem;
      min-height: 68px;
    }
  }
  textarea::placeholder {
    color: var(--text-dim);
    font-style: italic;
  }
  textarea:focus {
    outline: none;
  }
  textarea:disabled {
    opacity: 0.4;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding: 0.2rem 0.5rem 0.5rem;
    border-top: 1px solid var(--border);
  }
  .toolbar :global(> *) {
    display: flex;
    align-items: center;
    justify-content: space-around;
    gap: 0.5rem;
    width: 100%;
  }
  @media (min-width: 1200px) {
    .toolbar {
      display: none;
    }
  }
</style>
