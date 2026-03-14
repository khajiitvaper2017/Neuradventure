<script lang="ts">
  import { onDestroy } from "svelte"
  import InlineTokens from "./InlineTokens.svelte"

  export let text: string | null | undefined
  export let title = "Background events"
  let open = false

  function onWindowKeydown(e: KeyboardEvent) {
    if (!open) return
    if (e.key === "Escape") open = false
  }

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onWindowKeydown)
    onDestroy(() => window.removeEventListener("keydown", onWindowKeydown))
  }

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
  <div class="bg-wrap">
    <details class="bg-details" bind:open>
      <summary class="bg-summary">
        <span class="bg-left">
          <span class="bg-caret" aria-hidden="true">▸</span>
          <span class="bg-title">{title}</span>
        </span>
        <span class="bg-meta">{open ? "shown" : "hidden"}</span>
      </summary>
    </details>

    {#if open}
      <div class="bg-popover" role="region" aria-label={title}>
        {#each paras as para}
          <p class="bg-para"><InlineTokens text={para} /></p>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .bg-wrap {
    position: relative;
    margin-top: 0.65rem;
    overflow-anchor: none;
  }

  .bg-details {
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

  .bg-popover {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 0.4rem);
    z-index: 20;
    padding: 0.6rem 0.8rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-raised);
    box-shadow: var(--shadow-sm);
    max-height: min(42vh, 340px);
    overflow: auto;
    overscroll-behavior: contain;
    outline: none;
  }
  .bg-popover:focus-visible {
    box-shadow:
      0 0 0 2px var(--focus-glow),
      var(--shadow-sm);
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
