<script lang="ts">
  import type { ChatMember } from "../../api/client.js"

  export let open = false
  export let disabled = false
  export let members: ChatMember[] = []

  export let onPick: ((memberId: number) => void) | undefined = undefined
  export let onClose: (() => void) | undefined = undefined

  function close() {
    if (disabled) return
    onClose?.()
  }

  function onBackdropClick(e: MouseEvent) {
    if (e.currentTarget !== e.target) return
    close()
  }

  function onBackdropKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      close()
    }
  }
</script>

{#if open}
  <div
    class="overlay overlay--modal"
    role="button"
    tabindex="0"
    aria-label="Close speaker picker"
    onclick={onBackdropClick}
    onkeydown={onBackdropKeydown}
  >
    <div class="modal" role="dialog" aria-modal="true" aria-label="Next speaker" tabindex="-1">
      <h3 class="modal__title">Next Speaker</h3>
      <p class="modal__message">Choose which AI should reply next.</p>
      <div class="speaker-list">
        {#each members as member}
          <button class="speaker-btn" onclick={() => onPick?.(member.id)} {disabled}>
            {member.name}
          </button>
        {/each}
      </div>
      <div class="modal__actions">
        <button class="btn-ghost" onclick={close} {disabled}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .speaker-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .speaker-btn {
    background: var(--bg-action);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    text-align: left;
    cursor: pointer;
  }
  .speaker-btn:hover:not(:disabled) {
    border-color: var(--border-hover);
  }
  .speaker-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
