<script lang="ts">
  import InlineTokens from "@/components/rich/InlineTokens.svelte"
  import { looksLikeBlockHtml, looksLikeHtml, sanitizeBlockHtml, sanitizeInlineHtml } from "@/utils/sanitizeHtml"

  type Props = {
    text?: string
    mode?: "inline" | "block"
  }

  let { text = "", mode = "inline" }: Props = $props()

  let raw = $derived(typeof text === "string" ? text : "")
  let tag = $derived(mode === "block" ? "div" : "span")
  let hasHtml = $derived(mode === "block" ? looksLikeHtml(raw) || looksLikeBlockHtml(raw) : looksLikeHtml(raw))
  let sanitized = $derived(hasHtml ? (mode === "block" ? sanitizeBlockHtml(raw) : sanitizeInlineHtml(raw)) : "")
</script>

{#if hasHtml}
  <svelte:element this={tag} class={`rich-html rich-html--${mode}`}>
    {@html sanitized}
  </svelte:element>
{:else}
  <InlineTokens text={raw} />
{/if}
