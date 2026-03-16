<script lang="ts">
  import RichText from "@/components/rich/RichText.svelte"
  import BackgroundEventsReveal from "@/components/rich/BackgroundEventsReveal.svelte"
  import { looksLikeBlockHtml } from "@/utils/sanitizeHtml"

  type Props = {
    narrativeText?: string | null
    backgroundEvents?: string | null
    currentScene?: string | null
    timeOfDay?: string | null
  }

  let { narrativeText = null, backgroundEvents = null, currentScene = null, timeOfDay = null }: Props = $props()

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
  const show = $derived(narrativeParas.length > 0 || trimmedBg.length > 0)
</script>

{#if show}
  <div class="stream-preview font-story" aria-live="polite">
    {#if currentScene || timeOfDay}
      <div class="stream-preview__scene mb-2 font-sans text-[11px] uppercase tracking-wider text-muted-foreground/80">
        {#if currentScene}{currentScene}{/if}{#if currentScene && timeOfDay}
          ·
        {/if}{#if timeOfDay}{timeOfDay}{/if}
      </div>
    {/if}

    <BackgroundEventsReveal text={backgroundEvents} />

    {#if narrativeIsBlockHtml}
      <div class="stream-preview__para mb-4 whitespace-pre-line text-[15px] leading-7 text-foreground">
        <RichText text={trimmedNarrative} mode="block" />
      </div>
    {:else}
      {#each narrativeParas as para, index (index)}
        <p class="stream-preview__para mb-4 whitespace-pre-line text-[15px] leading-7 text-foreground">
          <RichText text={para} mode="inline" />
        </p>
      {/each}
    {/if}
  </div>
{/if}
