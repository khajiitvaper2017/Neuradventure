<script lang="ts">
  import type { TurnSummary, TurnVariantSummary } from "@/types/types"
  import { cn } from "@/utils.js"
  import { SquarePen, Trash } from "@lucide/svelte"
  import BackgroundEventsReveal from "@/components/rich/BackgroundEventsReveal.svelte"
  import RichText from "@/components/rich/RichText.svelte"
  import { currentStoryInitialWorld, currentStoryOpeningScenario, turns, worldState, isGenerating } from "@/stores/game"
  import { streamingEnabled } from "@/stores/settings"
  import { Button } from "@/components/ui/button"
  import { Textarea } from "@/components/ui/textarea"
  import { ScrollArea } from "@/components/ui/scroll-area"

  type Props = {
    storyDiv?: HTMLDivElement | null
    initialScrollDone?: boolean
    flashScene?: boolean
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
    streamScene?: string
    streamTime?: string
    pendingPlayerInput?: string
  }

  let {
    storyDiv = $bindable(null),
    initialScrollDone = false,
    flashScene = false,
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
    streamScene = "",
    streamTime = "",
    pendingPlayerInput = "",
  }: Props = $props()

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
          flashScene && "animate-pulse",
        )}
      >
        {$worldState.current_scene} · {$worldState.time_of_day}
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
          {$currentStoryInitialWorld.current_scene} · {$currentStoryInitialWorld.time_of_day}
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

    {#snippet turnPlayerBar(playerInput, opts)}
      <div
        class={cn(
          "my-4 -mx-5 flex scroll-mt-6 items-baseline gap-2 bg-accent/60 px-5 py-3 font-story text-sm italic leading-relaxed text-accent-foreground/90 min-[1200px]:-mx-10 min-[1200px]:px-10",
          opts.isFresh && "animate-in fade-in slide-in-from-bottom-1 duration-200",
        )}
        aria-live={opts.ariaLive ? "polite" : undefined}
      >
        {#if playerInput.trim().length > 0}
          <SquarePen class="mt-[1px] shrink-0 opacity-60" size={12} strokeWidth={2} aria-hidden="true" />
        {/if}
        <span class="min-w-0 flex-1">
          <RichText text={playerInput} mode="inline" />
        </span>

        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8"
          onclick={opts.onEdit}
          disabled={$isGenerating || !opts.onEdit}
          title="Edit turn"
          aria-label="Edit turn"
        >
          <SquarePen size={12} strokeWidth={2} aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onclick={opts.onDelete}
          disabled={$isGenerating || !opts.onDelete}
          title="Delete turn"
          aria-label="Delete turn"
        >
          <Trash size={12} strokeWidth={2} aria-hidden="true" />
        </Button>
      </div>
    {/snippet}

    {#snippet turnBody(opts)}
      <div data-turn-anchor={opts.anchorId ?? undefined} class="mb-4 scroll-mt-6">
        {#if opts.statusText}
          <p class="text-sm italic text-muted-foreground">{opts.statusText}</p>
        {:else}
          {#if opts.worldLine}
            <p class="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground/80">
              {opts.worldLine}
            </p>
          {/if}

          <BackgroundEventsReveal text={opts.backgroundEvents} />

          {@const narrative = opts.narrativeText ?? ""}
          {#if narrative.trim().length > 0}
            <div
              class={cn(
                "whitespace-pre-line font-story text-[length:var(--story-size)] leading-[var(--story-line)] text-foreground",
                opts.isFresh && "animate-in fade-in slide-in-from-bottom-1 duration-300",
              )}
            >
              <RichText text={narrative} mode="block" />
            </div>
          {/if}
        {/if}
      </div>
    {/snippet}

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
        {@render turnPlayerBar(turn.player_input, {
          isFresh,
          onEdit: () => startEditTurn?.(turn),
          onDelete: () => deleteTurn?.(turn.id),
        })}

        {@render turnBody({
          anchorId: turn.id,
          statusText: $isGenerating && regeneratingTurnId === turn.id ? "Regenerating…" : "",
          worldLine: turn.world ? `${turn.world.current_scene} · ${turn.world.time_of_day}` : "",
          backgroundEvents: turn.background_events,
          narrativeText: turn.narrative_text,
          isFresh,
        })}

        {#if !($isGenerating && regeneratingTurnId === turn.id) && i === $turns.length - 1 && lastTurnVariants.length > 1}
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

    {#if $isGenerating && $streamingEnabled}
      {@const pendingInput = pendingPlayerInput}
      {@const streamWorldLine =
        streamScene && streamTime ? `${streamScene} · ${streamTime}` : streamScene || streamTime || ""}

      {@render turnPlayerBar(pendingInput, { isFresh: false, ariaLive: true })}

      {@render turnBody({
        statusText:
          streamNarrative.trim().length === 0 && (streamBackground?.trim() ?? "").length === 0 ? "Generating…" : "",
        worldLine: streamWorldLine,
        backgroundEvents: streamBackground,
        narrativeText: streamNarrative,
        isFresh: false,
      })}
    {/if}

    <div class="h-4"></div>
  </div>
</ScrollArea>
