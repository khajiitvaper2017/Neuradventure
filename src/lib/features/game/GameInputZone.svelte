<script lang="ts">
  import { Button } from "@/components/ui/button"
  import { House, LoaderCircle, MapPin, Smile, User, Users } from "@lucide/svelte"
  import ConversationInput from "@/components/inputs/ConversationInput.svelte"
  import { showCharSheet, showLocations, showNPCTracker } from "@/stores/router"
  import { currentStoryModules, isGenerating, turns } from "@/stores/game"
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
    isImpersonating?: boolean
    onSend?: () => void
    onFocus?: () => void
    onCancelLastTurn?: () => void
    onUndoCancelLastTurn?: () => void
    onRegenerateLastTurn?: () => void
    onImpersonatePlayer?: () => void
    onGoHome?: () => void
  }

  let {
    input = $bindable(""),
    actionMode = $bindable("do" as ActionMode),
    textareaEl = $bindable(null),
    canUndoCancel = false,
    isImpersonating = false,
    onSend,
    onFocus,
    onCancelLastTurn,
    onUndoCancelLastTurn,
    onRegenerateLastTurn,
    onImpersonatePlayer,
    onGoHome,
  }: Props = $props()

  const trackNpcs = $derived($currentStoryModules?.track_npcs ?? true)
  const trackLocations = $derived($currentStoryModules?.track_locations ?? true)
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
            <LoaderCircle class="animate-spin" size={14} strokeWidth={2.2} aria-hidden="true" />
          {:else}
            <Smile size={14} strokeWidth={2} aria-hidden="true" />
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
      <House size={14} strokeWidth={1.8} aria-hidden="true" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="h-9 w-9 text-muted-foreground"
      onclick={() => showCharSheet.update((v) => !v)}
      title="Character"
      aria-label="Character"
    >
      <User size={14} strokeWidth={1.8} aria-hidden="true" />
    </Button>
    {#if trackNpcs}
      <Button
        variant="ghost"
        size="icon"
        class="h-9 w-9 text-muted-foreground"
        onclick={() => showNPCTracker.update((v) => !v)}
        title="NPCs"
        aria-label="NPCs"
      >
        <Users size={14} strokeWidth={1.8} aria-hidden="true" />
      </Button>
    {/if}
    {#if trackLocations}
      <Button
        variant="ghost"
        size="icon"
        class="h-9 w-9 text-muted-foreground"
        onclick={() => showLocations.update((v) => !v)}
        title="Locations"
        aria-label="Locations"
      >
        <MapPin size={14} strokeWidth={1.8} aria-hidden="true" />
      </Button>
    {/if}
  {/snippet}
</ConversationInput>
