<script lang="ts">
  import type { TurnSummary, TurnVariantSummary } from "@/types/types"
  import { cn } from "@/utils.js"
  import { SquarePen } from "@lucide/svelte"
  import StoryTurnRow from "@/features/game/StoryTurnRow.svelte"
  import RichText from "@/components/rich/RichText.svelte"
  import { currentStoryInitialWorld, currentStoryOpeningScenario, turns, worldState, isGenerating } from "@/stores/game"
  import { streamingEnabled } from "@/stores/settings"
  import { Button } from "@/components/ui/button"
  import { Textarea } from "@/components/ui/textarea"
  import { ScrollArea } from "@/components/ui/scroll-area"

  type Props = {
    storyDiv?: HTMLDivElement | null
    initialScrollDone?: boolean
    streamPreviewAnchorId?: string
    flashLocation?: boolean
    flashOpening?: boolean
    editingOpening?: boolean
    openingDraft?: string
    startEditOpening?: () => void
    cancelEditOpening?: () => void
    saveOpening?: () => void
    editingTurnId?: number | null
    editPlayerInput?: string
    editNarrative?: string
    startEditTurn?: (turn: TurnSummary) => void
    cancelEditTurn?: () => void
    saveTurnEdit?: (turnId: number) => void
    deleteTurn?: (turnId: number) => void
    userActed?: boolean
    regeneratingTurnId?: number | null
    lastTurnVariants?: TurnVariantSummary[]
    activeVariantId?: number | null
    selectVariant?: (variantId: number) => void
    handleStoryScroll?: () => void
    streamNarrative?: string
    streamBackground?: string
    streamLocation?: string
    streamTime?: string
    pendingPlayerInput?: string
  }

  let {
    storyDiv = $bindable(null),
    initialScrollDone = false,
    streamPreviewAnchorId = "story-stream-preview",
    flashLocation = false,
    flashOpening = false,
    editingOpening = false,
    openingDraft = $bindable(""),
    startEditOpening,
    cancelEditOpening,
    saveOpening,
    editingTurnId = null,
    editPlayerInput = $bindable(""),
    editNarrative = $bindable(""),
    startEditTurn,
    cancelEditTurn,
    saveTurnEdit,
    deleteTurn,
    userActed = false,
    regeneratingTurnId = null,
    lastTurnVariants = [],
    activeVariantId = null,
    selectVariant,
    handleStoryScroll,
    streamNarrative = "",
    streamBackground = "",
    streamLocation = "",
    streamTime = "",
    pendingPlayerInput = "",
  }: Props = $props()

  let streamWorldLine = $derived(
    streamLocation && streamTime ? `${streamLocation} · ${streamTime}` : streamLocation || streamTime || "",
  )

  let liveTurn = $derived.by(() => {
    if (regeneratingTurnId !== null) {
      const turn = $turns.find((item) => item.id === regeneratingTurnId)
      if (!turn) return null
      return {
        anchorId: turn.id,
        playerInput: turn.player_input,
        statusText: "Regenerating…",
        worldLine: streamWorldLine,
        backgroundEvents: streamBackground,
        narrativeText: streamNarrative,
      }
    }

    if (!$isGenerating || !$streamingEnabled) return null

    const hasPreviewContent = streamNarrative.trim().length > 0 || streamBackground.trim().length > 0
    return {
      anchorId: null,
      playerInput: pendingPlayerInput,
      statusText: hasPreviewContent ? "" : "Generating…",
      worldLine: streamWorldLine,
      backgroundEvents: streamBackground,
      narrativeText: streamNarrative,
    }
  })

  $effect(() => {
    if (!storyDiv || !handleStoryScroll) return
    const el = storyDiv
    const listener = () => handleStoryScroll?.()
    el.addEventListener("scroll", listener, { passive: true })
    return () => el.removeEventListener("scroll", listener)
  })
</script>

<ScrollArea
  class={cn("min-h-0 flex-1", !(initialScrollDone || $turns.length === 0) && "invisible")}
  bind:viewportRef={storyDiv}
>
  <div class="flex flex-col px-5 pb-2 pt-6 min-[1200px]:px-10 min-[1200px]:pt-8">
    {#if $worldState}
      <p
        class={cn(
          "mb-5 text-[11px] uppercase tracking-wider text-muted-foreground/80 min-[1200px]:hidden",
          flashLocation && "animate-pulse",
        )}
      >
        {$worldState.current_location} · {$worldState.time_of_day}
      </p>
    {/if}

    <div class="mb-5 rounded-lg border bg-card p-4">
      <div
        class="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
      >
        <span>Opening</span>
        {#if !editingOpening}
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            onclick={startEditOpening}
            disabled={$isGenerating}
            title="Edit opening"
            aria-label="Edit opening"
          >
            <SquarePen size={12} strokeWidth={2} aria-hidden="true" />
          </Button>
        {/if}
      </div>
      {#if $currentStoryInitialWorld}
        <p class="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground/80">
          {$currentStoryInitialWorld.current_location} · {$currentStoryInitialWorld.time_of_day}
        </p>
      {/if}
      {#if editingOpening}
        <div class="mt-3 space-y-3">
          <Textarea bind:value={openingDraft} rows={6} disabled={$isGenerating} />
          <div class="flex items-center justify-end gap-2">
            <Button variant="outline" onclick={cancelEditOpening} disabled={$isGenerating}>Cancel</Button>
            <Button onclick={saveOpening} disabled={$isGenerating}>Save</Button>
          </div>
        </div>
      {:else}
        <div
          class={cn(
            "mt-3 whitespace-pre-line font-story text-[length:var(--story-size)] italic leading-[var(--story-line)] text-muted-foreground",
            flashOpening && "animate-pulse",
          )}
        >
          <RichText text={$currentStoryOpeningScenario || $worldState?.memory || ""} mode="block" />
        </div>
      {/if}
    </div>

    {#each $turns as turn, i (turn.id)}
      {#if editingTurnId === turn.id}
        <div data-turn-anchor={turn.id} class="mb-5 scroll-mt-6 rounded-lg border bg-card p-4">
          <div class="space-y-3">
            <div class="space-y-2">
              <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Player Input</div>
              <Textarea bind:value={editPlayerInput} rows={2} disabled={$isGenerating} />
            </div>
            <div class="space-y-2">
              <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Story Text</div>
              <Textarea bind:value={editNarrative} rows={6} disabled={$isGenerating} />
            </div>
            <div class="flex items-center justify-end gap-2">
              <Button variant="outline" onclick={cancelEditTurn} disabled={$isGenerating}>Cancel</Button>
              <Button onclick={() => saveTurnEdit?.(turn.id)} disabled={$isGenerating}>Save</Button>
            </div>
          </div>
        </div>
      {:else}
        {@const isFresh = userActed && i === $turns.length - 1 && !$isGenerating}
        {@const liveTurnHere = liveTurn?.anchorId === turn.id ? liveTurn : null}
        <StoryTurnRow
          anchorId={turn.id}
          playerInput={liveTurnHere?.playerInput ?? turn.player_input}
          onEdit={() => startEditTurn?.(turn)}
          onDelete={() => deleteTurn?.(turn.id)}
          statusText={liveTurnHere?.statusText ?? ""}
          worldLine={liveTurnHere?.worldLine ??
            (turn.world ? `${turn.world.current_location} · ${turn.world.time_of_day}` : "")}
          backgroundEvents={liveTurnHere?.backgroundEvents ?? turn.background_events}
          narrativeText={liveTurnHere?.narrativeText ?? turn.narrative_text}
          {isFresh}
        />

        {#if !liveTurnHere && i === $turns.length - 1 && lastTurnVariants.length > 1}
          <div class="mt-4 flex flex-wrap items-center gap-2">
            <span class="mr-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Versions</span>
            {#each lastTurnVariants as variant (variant.id)}
              <Button
                variant={activeVariantId === variant.id ? "secondary" : "outline"}
                size="sm"
                class="h-8 w-10 px-0 font-mono"
                onclick={() => selectVariant?.(variant.id)}
                disabled={$isGenerating}
                title={`Version ${variant.variant_index}`}
              >
                {variant.variant_index}
              </Button>
            {/each}
          </div>
        {/if}
      {/if}
    {/each}

    {#if liveTurn && liveTurn.anchorId === null}
      <StoryTurnRow
        anchorId={streamPreviewAnchorId}
        playerInput={liveTurn.playerInput}
        statusText={liveTurn.statusText}
        worldLine={liveTurn.worldLine}
        backgroundEvents={liveTurn.backgroundEvents}
        narrativeText={liveTurn.narrativeText}
        isFresh={false}
        ariaLive={true}
      />
    {/if}

    <div class="h-4"></div>
  </div>
</ScrollArea>
