<script lang="ts">
  import type { TurnSummary, TurnVariantSummary } from "@/shared/types"
  import { cn } from "@/utils.js"
  import { SquarePen, Trash } from "@lucide/svelte"
  import BackgroundEventsReveal from "@/components/rich/BackgroundEventsReveal.svelte"
  import RichText from "@/components/rich/RichText.svelte"
  import StreamingTurnPreview from "@/components/rich/StreamingTurnPreview.svelte"
  import { looksLikeBlockHtml } from "@/utils/sanitizeHtml"
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
  }: Props = $props()

  $effect(() => {
    if (!storyDiv || !handleStoryScroll) return
    const el = storyDiv
    const listener = () => handleStoryScroll?.()
    el.addEventListener("scroll", listener, { passive: true })
    return () => el.removeEventListener("scroll", listener)
  })

  function paragraphs(text: string): string[] {
    let normalized = text.replace(/\r\n/g, "\n")
    if (!normalized.includes("\n") && normalized.includes("\\n")) {
      normalized = normalized.replace(/\\n/g, "\n")
    }
    const hasBlankLines = /\n\s*\n/.test(normalized)
    return normalized
      .split(hasBlankLines ? /\n\s*\n+/ : /\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
  }
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
            "mt-3 whitespace-pre-line font-story text-sm italic leading-relaxed text-muted-foreground",
            flashOpening && "animate-pulse",
          )}
        >
          <RichText text={$currentStoryOpeningScenario || $worldState?.memory || ""} mode="block" />
        </div>
      {/if}
    </div>

    {#each $turns as turn, i (turn.id)}
      {#if editingTurnId === turn.id}
        <div class="mb-5 rounded-lg border bg-card p-4">
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
        <div
          class={cn(
            "my-4 -mx-5 flex items-baseline gap-2 bg-accent/60 px-5 py-3 font-story text-sm italic leading-relaxed text-accent-foreground/90 min-[1200px]:-mx-10 min-[1200px]:px-10",
            isFresh && "animate-in fade-in slide-in-from-bottom-1 duration-200",
          )}
        >
          {#if turn.player_input.trim().length > 0}
            <SquarePen class="mt-[1px] shrink-0 opacity-60" size={12} strokeWidth={2} aria-hidden="true" />
          {/if}
          <span class="min-w-0 flex-1">
            <RichText text={turn.player_input} mode="inline" />
          </span>
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            onclick={() => startEditTurn?.(turn)}
            disabled={$isGenerating}
            title="Edit turn"
            aria-label="Edit turn"
          >
            <SquarePen size={12} strokeWidth={2} aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onclick={() => deleteTurn?.(turn.id)}
            disabled={$isGenerating}
            title="Delete turn"
          >
            <Trash size={12} strokeWidth={2} aria-hidden="true" />
          </Button>
        </div>

        <div class="mb-4">
          {#if $isGenerating && regeneratingTurnId === turn.id}
            <p class="text-sm italic text-muted-foreground">Regenerating…</p>
          {:else}
            {#if turn.world}
              <p class="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground/80">
                {turn.world.current_scene} · {turn.world.time_of_day}
              </p>
            {/if}

            <BackgroundEventsReveal text={turn.background_events} />

            {#if looksLikeBlockHtml(turn.narrative_text)}
              <div
                class={cn("font-story", isFresh && "animate-in fade-in slide-in-from-bottom-1 duration-300")}
                style="animation-delay: 0s"
              >
                <RichText text={turn.narrative_text} mode="block" />
              </div>
            {:else}
              {#each paragraphs(turn.narrative_text) as para, j (j)}
                <p
                  class={cn(
                    "mb-4 whitespace-pre-line font-story text-[15px] leading-7 text-foreground",
                    isFresh && "animate-in fade-in slide-in-from-bottom-1 duration-300",
                  )}
                  style="animation-delay: {j * 0.06}s"
                >
                  <RichText text={para} mode="inline" />
                </p>
              {/each}
            {/if}

            {#if i === $turns.length - 1 && lastTurnVariants.length > 1}
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
        </div>
      {/if}
    {/each}

    {#if $isGenerating && $streamingEnabled}
      <StreamingTurnPreview
        narrativeText={streamNarrative}
        backgroundEvents={streamBackground}
        currentScene={streamScene}
        timeOfDay={streamTime}
      />
    {/if}

    <div class="h-4"></div>
  </div>
</ScrollArea>
