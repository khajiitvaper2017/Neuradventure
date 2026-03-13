<script lang="ts">
  import { tokenizeInline } from "../../utils/inlineTokens.js"

  export let text = ""

  const HR_RE = /^\s*-{3,}\s*$/
  function isHrLine(line: string): boolean {
    return HR_RE.test(line)
  }

  $: lines = text.split(/\r?\n/)
</script>

{#each lines as line, index (index)}
  {#if isHrLine(line)}
    <hr class="inline-hr" />
  {:else}
    {#each tokenizeInline(line) as token}
      {#if token.type === "text"}
        {token.content}
      {:else if token.type === "code"}
        <span class="inline-code">{token.content}</span>
      {:else if token.type === "image"}
        <img class="inline-image" src={token.src} alt={token.alt} style={token.style} loading="lazy" decoding="async" />
      {:else if token.type === "em"}
        <em class="inline-em">{token.content}</em>
      {:else if token.type === "dquote"}
        <span class="inline-quote">"{token.content}"</span>
      {:else}
        <span class="inline-quote">'{token.content}'</span>
      {/if}
    {/each}
  {/if}

  {#if index < lines.length - 1 && !isHrLine(line)}
    <br />
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
  .inline-image {
    display: block;
    max-width: 100%;
    border-radius: 6px;
    margin: 0.35rem 0;
    object-fit: contain;
  }
  .inline-em {
    font-style: italic;
    color: var(--accent);
  }
  .inline-hr {
    border: none;
    border-top: 1px solid var(--accent);
    opacity: 0.45;
    margin: 0.65rem 0;
  }
</style>
