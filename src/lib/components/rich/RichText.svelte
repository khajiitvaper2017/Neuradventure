<script lang="ts">
  import InlineTokens from "@/components/rich/InlineTokens.svelte"
  import { looksLikeBlockHtml, looksLikeHtml, sanitizeBlockHtml, sanitizeInlineHtml } from "@/utils/text/sanitizeHtml"

  type Props = {
    text?: string
    mode?: "inline" | "block"
  }

  let { text = "", mode = "inline" }: Props = $props()

  const raw = $derived(typeof text === "string" ? text : "")
  const hasHtml = $derived(mode === "block" ? looksLikeHtml(raw) || looksLikeBlockHtml(raw) : looksLikeHtml(raw))
  const sanitized = $derived(hasHtml ? (mode === "block" ? sanitizeBlockHtml(raw) : sanitizeInlineHtml(raw)) : "")
  const tag = $derived(mode === "block" ? "div" : "span")
</script>

{#if hasHtml}
  <svelte:element this={tag} class={`rich-html rich-html--${mode}`}>
    {@html sanitized}
  </svelte:element>
{:else}
  <InlineTokens text={raw} />
{/if}
