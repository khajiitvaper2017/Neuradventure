<script lang="ts">
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import IconFace from "@/components/icons/IconFace.svelte"
  import IconHome from "@/components/icons/IconHome.svelte"
  import IconMapPin from "@/components/icons/IconMapPin.svelte"
  import IconSpinner from "@/components/icons/IconSpinner.svelte"
  import IconUser from "@/components/icons/IconUser.svelte"
  import IconUsers from "@/components/icons/IconUsers.svelte"
  import ConversationInput from "@/components/inputs/ConversationInput.svelte"
  import { showCharSheet, showLocations, showNPCTracker } from "@/stores/router"
  import { isGenerating, turns } from "@/stores/game"
  import { streamingEnabled } from "@/stores/settings"
  import { cn } from "@/utils.js"

  type ActionMode = "do" | "say" | "story"
  const ACTION_MODES: ActionMode[] = ["do", "say", "story"]
  const MODE_HINTS: Record<ActionMode, string> = {
    do: "What do you do?",
    say: "What do you say?",
    story: "Write story text directly...",
  }

  type Props = {
    input?: string
    actionMode?: ActionMode
    textareaEl?: HTMLTextAreaElement | null
    canUndoCancel?: boolean
    followStream?: boolean
    isImpersonating?: boolean
    onSend?: () => void
    onFocus?: () => void
    onCancelLastTurn?: () => void
    onUndoCancelLastTurn?: () => void
    onJumpToLatest?: () => void
    onRegenerateLastTurn?: () => void
    onImpersonatePlayer?: () => void
    onGoHome?: () => void
  }

  let {
    input = $bindable(""),
    actionMode = $bindable("do" as ActionMode),
    textareaEl = $bindable(null),
    canUndoCancel = false,
    followStream = true,
    isImpersonating = false,
    onSend,
    onFocus,
    onCancelLastTurn,
    onUndoCancelLastTurn,
    onJumpToLatest,
    onRegenerateLastTurn,
    onImpersonatePlayer,
    onGoHome,
  }: Props = $props()
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
    <div class="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8 text-muted-foreground"
        onclick={() => (input = "")}
        disabled={!input || $isGenerating}
        aria-label="Clear input"
        title="Clear"
      >
        ×
      </Button>

      <div
        class="inline-flex items-center gap-1 rounded-md bg-muted p-1 text-muted-foreground"
        role="group"
        aria-label="Action mode"
      >
        {#each ACTION_MODES as mode (mode)}
          <Button
            variant="ghost"
            size="sm"
            class={cn(
              "h-8 rounded-sm px-3 text-xs font-medium uppercase tracking-wider",
              actionMode === mode
                ? "bg-background text-foreground shadow-sm hover:bg-background"
                : "hover:bg-background/50 hover:text-foreground",
            )}
            onclick={() => (actionMode = mode)}
            disabled={$isGenerating}
            aria-pressed={actionMode === mode}
          >
            {mode}
          </Button>
        {/each}
      </div>

      <div class="ml-auto flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8"
          onclick={onCancelLastTurn}
          disabled={$isGenerating || $turns.length === 0}
          title="Cancel last turn"
          aria-label="Cancel last turn"
        >
          ↶
        </Button>

        {#if canUndoCancel}
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            onclick={onUndoCancelLastTurn}
            disabled={$isGenerating}
            title="Undo cancel"
            aria-label="Undo cancel"
          >
            ↷
          </Button>
        {/if}

        {#if $isGenerating && $streamingEnabled}
          {#if followStream}
            <Badge
              variant="secondary"
              class="h-8 px-2 text-[11px] font-medium"
              title="Streaming output is following the latest text"
            >
              Live
            </Badge>
          {:else}
            <Button
              variant="outline"
              size="sm"
              class="h-8"
              onclick={onJumpToLatest}
              title="Jump to the latest streamed output"
              aria-label="Jump to the latest streamed output"
            >
              Jump to latest
            </Button>
          {/if}
        {/if}

        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8"
          onclick={onRegenerateLastTurn}
          disabled={$isGenerating || $turns.length === 0}
          title="Regenerate last turn"
          aria-label="Regenerate last turn"
        >
          ↻
        </Button>

        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8"
          onclick={onImpersonatePlayer}
          disabled={$isGenerating || isImpersonating}
          title="Impersonate player action"
          aria-label="Impersonate player action"
        >
          {#if isImpersonating}
            <IconSpinner className="animate-spin" size={14} strokeWidth={2.2} />
          {:else}
            <IconFace size={14} strokeWidth={2} />
          {/if}
        </Button>
      </div>
    </div>
  {/snippet}

  {#snippet bottomControls()}
    <Button
      variant="ghost"
      size="icon"
      class="h-9 w-9 text-muted-foreground"
      onclick={onGoHome}
      title="Stories"
      aria-label="Stories"
    >
      <IconHome size={14} strokeWidth={1.8} />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="h-9 w-9 text-muted-foreground"
      onclick={() => showCharSheet.update((v) => !v)}
      title="Character"
      aria-label="Character"
    >
      <IconUser size={14} strokeWidth={1.8} />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="h-9 w-9 text-muted-foreground"
      onclick={() => showNPCTracker.update((v) => !v)}
      title="NPCs"
      aria-label="NPCs"
    >
      <IconUsers size={14} strokeWidth={1.8} />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="h-9 w-9 text-muted-foreground"
      onclick={() => showLocations.update((v) => !v)}
      title="Locations"
      aria-label="Locations"
    >
      <IconMapPin size={14} strokeWidth={1.8} />
    </Button>
  {/snippet}
</ConversationInput>
