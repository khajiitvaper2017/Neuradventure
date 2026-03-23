<script lang="ts">
  import { cn } from "@/utils.js"
  import { SquarePen, Trash } from "@lucide/svelte"
  import RichText from "@/components/rich/RichText.svelte"
  import BackgroundEventsReveal from "@/components/rich/BackgroundEventsReveal.svelte"
  import { Button } from "@/components/ui/button"
  import { isGenerating } from "@/stores/game"
  import { looksLikeBlockHtml } from "@/utils/text/sanitizeHtml"

  type Props = {
    anchorId?: number | string | null
    playerInput?: string | null
    onEdit?: (() => void) | null
    onDelete?: (() => void) | null
    statusText?: string | null
    worldLine?: string | null
    narrativeText?: string | null
    backgroundEvents?: string | null
    isFresh?: boolean
    ariaLive?: boolean
  }

  let {
    anchorId = null,
    playerInput = null,
    onEdit = null,
    onDelete = null,
    statusText = null,
    worldLine = null,
    narrativeText = null,
    backgroundEvents = null,
    isFresh = false,
    ariaLive = false,
  }: Props = $props()

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

  const trimmedNarrative = $derived(typeof narrativeText === "string" ? narrativeText.trim() : "")
  const narrativeParas = $derived(trimmedNarrative ? paragraphs(trimmedNarrative) : [])
  const narrativeIsBlockHtml = $derived(trimmedNarrative ? looksLikeBlockHtml(trimmedNarrative) : false)
  const trimmedBg = $derived(typeof backgroundEvents === "string" ? backgroundEvents.trim() : "")
  const trimmedStatus = $derived(typeof statusText === "string" ? statusText.trim() : "")
  const trimmedWorldLine = $derived(typeof worldLine === "string" ? worldLine.trim() : "")
  const hasPlayerBar = $derived(playerInput !== null)
  const show = $derived(
    hasPlayerBar ||
      trimmedStatus.length > 0 ||
      trimmedWorldLine.length > 0 ||
      narrativeParas.length > 0 ||
      trimmedBg.length > 0,
  )
</script>

{#if show}
  <div data-turn-anchor={anchorId ?? undefined} class="mb-4 scroll-mt-6">
    {#if hasPlayerBar}
      <div
        class={cn(
          "my-4 -mx-5 flex items-baseline gap-2 bg-accent/60 px-5 py-3 font-story text-sm italic leading-relaxed text-accent-foreground/90 min-[1200px]:-mx-10 min-[1200px]:px-10",
          isFresh && "animate-in fade-in slide-in-from-bottom-1 duration-200",
        )}
        aria-live={ariaLive ? "polite" : undefined}
      >
        {#if (playerInput ?? "").trim().length > 0}
          <SquarePen class="mt-[1px] shrink-0 opacity-60" size={12} strokeWidth={2} aria-hidden="true" />
        {/if}
        <span class="min-w-0 flex-1">
          <RichText text={playerInput ?? ""} mode="inline" />
        </span>

        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8"
          onclick={onEdit}
          disabled={$isGenerating || !onEdit}
          title="Edit turn"
          aria-label="Edit turn"
        >
          <SquarePen size={12} strokeWidth={2} aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onclick={onDelete}
          disabled={$isGenerating || !onDelete}
          title="Delete turn"
          aria-label="Delete turn"
        >
          <Trash size={12} strokeWidth={2} aria-hidden="true" />
        </Button>
      </div>
    {/if}

    <div class="story-turn-row font-story">
      {#if trimmedStatus.length > 0}
        <p class="text-sm italic text-muted-foreground">{statusText}</p>
      {/if}

      {#if trimmedWorldLine.length > 0}
        <p class="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground/80">{worldLine}</p>
      {/if}

      <BackgroundEventsReveal text={backgroundEvents} />

      {#if trimmedNarrative.length > 0}
        {#if narrativeIsBlockHtml}
          <div
            class={cn(
              "mb-4 whitespace-pre-line text-[length:var(--story-size)] leading-[var(--story-line)] text-foreground",
              isFresh && "animate-in fade-in slide-in-from-bottom-1 duration-300",
            )}
          >
            <RichText text={trimmedNarrative} mode="block" />
          </div>
        {:else}
          <div class={cn(isFresh && "animate-in fade-in slide-in-from-bottom-1 duration-300")}>
            {#each narrativeParas as para, index (index)}
              <p
                class="mb-4 whitespace-pre-line text-[length:var(--story-size)] leading-[var(--story-line)] text-foreground"
              >
                <RichText text={para} mode="inline" />
              </p>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}
