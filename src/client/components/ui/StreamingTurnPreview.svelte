<script lang="ts">
  import InlineTokens from "./InlineTokens.svelte"
  import BackgroundEventsReveal from "./BackgroundEventsReveal.svelte"

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

    {#each narrativeParas as para}
      <p class="stream-preview__para"><InlineTokens text={para} /></p>
    {/each}
  </div>
{/if}
