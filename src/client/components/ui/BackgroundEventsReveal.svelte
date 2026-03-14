<script lang="ts">
  import InlineTokens from "./InlineTokens.svelte"

  export let text: string | null | undefined
  export let title = "Background events"

  function paragraphs(raw: string): string[] {
    let normalized = raw.replace(/\r\n/g, "\n")
    if (!normalized.includes("\n") && normalized.includes("\\n")) {
      normalized = normalized.replace(/\\n/g, "\n")
    }
    const hasBlankLines = /\n\s*\n/.test(normalized)
    return normalized
      .split(hasBlankLines ? /\n\s*\n+/ : /\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
  }

  $: trimmed = typeof text === "string" ? text.trim() : ""
  $: paras = trimmed ? paragraphs(trimmed) : []
</script>

{#if paras.length > 0}
  <details class="bg-details">
    <summary class="bg-summary">
      <span class="bg-left">
        <span class="bg-caret" aria-hidden="true">▸</span>
        <span class="bg-title">{title}</span>
      </span>
      <span class="bg-meta">hidden</span>
    </summary>
    <div class="bg-body">
      {#each paras as para}
        <p class="bg-para"><InlineTokens text={para} /></p>
      {/each}
    </div>
  </details>
{/if}

<style>
  .bg-details {
    margin-top: 0.65rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-action);
    overflow: hidden;
    transition:
      border-color 0.15s var(--ease-out),
      background 0.15s var(--ease-out);
  }

  .bg-summary {
    list-style: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.55rem 0.7rem;
    cursor: pointer;
    user-select: none;
    color: var(--text-dim);
    font-size: 0.82rem;
    letter-spacing: 0.02em;
  }

  .bg-summary:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--focus-glow);
  }

  .bg-details:hover {
    border-color: var(--border-hover);
    background: rgba(255, 255, 255, 0.05);
  }

  .bg-summary::-webkit-details-marker {
    display: none;
  }

  .bg-left {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
  }

  .bg-title {
    color: var(--text-action);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bg-meta {
    font-size: 0.78rem;
    color: var(--text-scene);
    letter-spacing: 0.03em;
  }

  .bg-caret {
    display: inline-block;
    transform: rotate(0deg);
    transition: transform 0.14s var(--ease-out);
    color: var(--accent);
  }

  details[open] .bg-caret {
    transform: rotate(90deg);
  }

  details[open] .bg-meta {
    color: var(--accent);
  }

  .bg-body {
    padding: 0.6rem 0.8rem 0.75rem;
    border-top: 1px solid var(--border);
  }

  .bg-para {
    color: var(--text-dim);
    font-family: var(--font-story);
    line-height: 1.65;
    font-size: 0.98rem;
  }

  .bg-para + .bg-para {
    margin-top: 0.55rem;
  }
</style>
