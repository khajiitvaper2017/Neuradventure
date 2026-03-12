<script lang="ts">
  import { tokenizeInline } from "../../utils/inlineTokens.js"

  export let text = ""
</script>

{#each tokenizeInline(text) as token}
  {#if token.type === "text"}
    {token.content}
  {:else if token.type === "code"}
    <span class="inline-code">{token.content}</span>
  {:else if token.type === "dquote"}
    <span class="inline-quote">"{token.content}"</span>
  {:else}
    <span class="inline-quote">'{token.content}'</span>
  {/if}
{/each}

<style>
  .inline-code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.95em;
    padding: 0.08em 0.28em;
    border-radius: 4px;
    border: 1px solid var(--border);
    color: var(--accent);
  }
  .inline-quote {
    padding: 0.04em 0.12em;
    border-radius: 4px;
    color: var(--accent);
    font-style: italic;
  }
</style>
