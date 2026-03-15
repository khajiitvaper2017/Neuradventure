<script lang="ts">
  import IconFace from "@/components/icons/IconFace.svelte"
  import IconHome from "@/components/icons/IconHome.svelte"
  import IconMapPin from "@/components/icons/IconMapPin.svelte"
  import IconSpinner from "@/components/icons/IconSpinner.svelte"
  import IconUser from "@/components/icons/IconUser.svelte"
  import IconUsers from "@/components/icons/IconUsers.svelte"
  import ConversationInput from "@/components/inputs/ConversationInput.svelte"
  import { showCharSheet, showLocations, showNPCTracker } from "@/stores/ui"
  import { isGenerating, turns } from "@/stores/game"
  import { streamingEnabled } from "@/stores/settings"

  type ActionMode = "do" | "say" | "story"
  const ACTION_MODES: ActionMode[] = ["do", "say", "story"]
  const MODE_HINTS: Record<ActionMode, string> = {
    do: "What do you do?",
    say: "What do you say?",
    story: "Write story text directly...",
  }

  export let input = ""
  export let actionMode: ActionMode = "do"

  export let textareaEl: HTMLTextAreaElement | null = null

  export let canUndoCancel = false
  export let followStream = true
  export let isImpersonating = false

  export let onSend: (() => void) | undefined = undefined
  export let onFocus: (() => void) | undefined = undefined
  export let onCancelLastTurn: (() => void) | undefined = undefined
  export let onUndoCancelLastTurn: (() => void) | undefined = undefined
  export let onJumpToLatest: (() => void) | undefined = undefined
  export let onRegenerateLastTurn: (() => void) | undefined = undefined
  export let onImpersonatePlayer: (() => void) | undefined = undefined
  export let onGoHome: (() => void) | undefined = undefined
</script>

<ConversationInput
  bind:textareaEl
  bind:value={input}
  placeholder={MODE_HINTS[actionMode]}
  disabled={$isGenerating}
  canSend={true}
  sending={$isGenerating}
  {onSend}
  {onFocus}
>
  {#snippet topControls()}
    <button class="mode-clear" onclick={() => (input = "")} disabled={!input || $isGenerating} aria-label="Clear"
      >×</button
    >

    <div class="mode-group" role="group" aria-label="Action mode">
      {#each ACTION_MODES as mode (mode)}
        <button
          class="mode-pill {actionMode === mode ? 'active' : ''}"
          onclick={() => (actionMode = mode)}
          disabled={$isGenerating}
        >
          {mode}
        </button>
      {/each}
    </div>

    <button
      class="mode-undo"
      onclick={onCancelLastTurn}
      disabled={$isGenerating || $turns.length === 0}
      title="Cancel last turn"
      aria-label="Cancel last turn"
    >
      ↶
    </button>

    {#if canUndoCancel}
      <button
        class="mode-undo-cancel"
        onclick={onUndoCancelLastTurn}
        disabled={$isGenerating}
        title="Undo cancel"
        aria-label="Undo cancel"
      >
        ↷
      </button>
    {/if}

    {#if $isGenerating && $streamingEnabled}
      {#if followStream}
        <span class="stream-lock-pill" title="Streaming output is following the latest text">Live</span>
      {:else}
        <button
          class="stream-lock-pill stream-lock-pill--paused"
          type="button"
          onclick={onJumpToLatest}
          title="Jump to the latest streamed output"
          aria-label="Jump to the latest streamed output"
        >
          Jump to latest
        </button>
      {/if}
    {/if}

    <button
      class="mode-regen"
      onclick={onRegenerateLastTurn}
      disabled={$isGenerating || $turns.length === 0}
      title="Regenerate last turn"
      aria-label="Regenerate last turn"
    >
      ↻
    </button>

    <button
      class="mode-impersonate"
      onclick={onImpersonatePlayer}
      disabled={$isGenerating || isImpersonating}
      title="Impersonate player action"
      aria-label="Impersonate player action"
    >
      {#if isImpersonating}
        <IconSpinner className="spin" size={14} strokeWidth={2.2} />
      {:else}
        <IconFace size={14} strokeWidth={2} />
      {/if}
    </button>
  {/snippet}

  {#snippet bottomControls()}
    <button class="tbtn" onclick={onGoHome} title="Stories">
      <IconHome size={14} strokeWidth={1.8} />
    </button>
    <button class="tbtn" onclick={() => showCharSheet.update((v) => !v)} title="Character">
      <IconUser size={14} strokeWidth={1.8} />
    </button>
    <button class="tbtn" onclick={() => showNPCTracker.update((v) => !v)} title="NPCs">
      <IconUsers size={14} strokeWidth={1.8} />
    </button>
    <button class="tbtn" onclick={() => showLocations.update((v) => !v)} title="Locations">
      <IconMapPin size={14} strokeWidth={1.8} />
    </button>
  {/snippet}
</ConversationInput>
