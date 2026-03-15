<script lang="ts">
  import { tokenizeInline } from "@/utils/inlineTokens"

  export let text = ""

  const HR_RE = /^\s*-{3,}\s*$/
  function isHrLine(line: string): boolean {
    return HR_RE.test(line)
  }

  $: lines = text.split(/\r?\n/)
</script>

{#each lines as line, index (index)}
  {#if isHrLine(line)}
    <hr class="my-3 border-0 border-t border-primary/40" />
  {:else}
    {#each tokenizeInline(line) as token}
      {#if token.type === "text"}
        {token.content}
      {:else if token.type === "code"}
        <span class="rounded border border-border px-1 py-px font-mono text-[0.95em] text-primary">{token.content}</span
        >
      {:else if token.type === "strong"}
        <strong class="font-bold">{token.content}</strong>
      {:else if token.type === "image"}
        <img
          class="mx-auto my-3 block max-h-[min(42vh,360px)] max-w-full rounded-md object-contain"
          src={token.src}
          alt={token.alt}
          style={token.style}
          loading="lazy"
          decoding="async"
        />
      {:else if token.type === "em"}
        <em class="italic">{token.content}</em>
      {:else if token.type === "quote"}
        <span class="text-primary">"""{token.content}"""</span>
      {:else if token.type === "dquote"}
        <span class="italic text-primary">"{token.content}"</span>
      {:else if token.type === "squote"}
        <span class="italic text-primary">'{token.content}'</span>
      {/if}
    {/each}
  {/if}

  {#if index < lines.length - 1 && !isHrLine(line)}
    <br />
  {/if}
{/each}
