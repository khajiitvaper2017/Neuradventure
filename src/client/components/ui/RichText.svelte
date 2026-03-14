<script lang="ts">
  import InlineTokens from "./InlineTokens.svelte"
  import { looksLikeBlockHtml, looksLikeHtml, sanitizeBlockHtml, sanitizeInlineHtml } from "../../utils/sanitizeHtml.js"

  export let text = ""
  export let mode: "inline" | "block" = "inline"

  $: raw = typeof text === "string" ? text : ""
  $: hasHtml = mode === "block" ? looksLikeHtml(raw) || looksLikeBlockHtml(raw) : looksLikeHtml(raw)
  $: sanitized = hasHtml ? (mode === "block" ? sanitizeBlockHtml(raw) : sanitizeInlineHtml(raw)) : ""
  $: tag = mode === "block" ? "div" : "span"
</script>

{#if hasHtml}
  <svelte:element this={tag} class={`rich-html rich-html--${mode}`}>
    {@html sanitized}
  </svelte:element>
{:else}
  <InlineTokens text={raw} />
{/if}
