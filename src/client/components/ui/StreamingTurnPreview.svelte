<script lang="ts">
  import RichText from "./RichText.svelte"
  import BackgroundEventsReveal from "./BackgroundEventsReveal.svelte"
  import { looksLikeBlockHtml } from "../../utils/sanitizeHtml.js"

  export let narrativeText: string | null | undefined
  export let backgroundEvents: string | null | undefined
  export let currentScene: string | null | undefined
  export let timeOfDay: string | null | undefined

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

  $: trimmedNarrative = typeof narrativeText === "string" ? narrativeText.trim() : ""
  $: narrativeParas = trimmedNarrative ? paragraphs(trimmedNarrative) : []
  $: narrativeIsBlockHtml = trimmedNarrative ? looksLikeBlockHtml(trimmedNarrative) : false
  $: trimmedBg = typeof backgroundEvents === "string" ? backgroundEvents.trim() : ""
  $: show = narrativeParas.length > 0 || trimmedBg.length > 0
</script>

{#if show}
  <div class="stream-preview" aria-live="polite">
    {#if currentScene || timeOfDay}
      <div class="stream-preview__scene">
        {#if currentScene}{currentScene}{/if}{#if currentScene && timeOfDay}
          ·
        {/if}{#if timeOfDay}{timeOfDay}{/if}
      </div>
    {/if}

    <BackgroundEventsReveal text={backgroundEvents} />

    {#if narrativeIsBlockHtml}
      <div class="stream-preview__para"><RichText text={trimmedNarrative} mode="block" /></div>
    {:else}
      {#each narrativeParas as para}
        <p class="stream-preview__para"><RichText text={para} mode="inline" /></p>
      {/each}
    {/if}
  </div>
{/if}
