<script lang="ts">
  import RichText from "@/components/rich/RichText.svelte"
  import { looksLikeBlockHtml } from "@/utils/text/sanitizeHtml"

  type Props = {
    text?: string | null
    title?: string
  }

  let { text = null, title = "Background events" }: Props = $props()
  let open = $state(false)

  function onWindowKeydown(e: KeyboardEvent) {
    if (!open) return
    if (e.key === "Escape") open = false
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

  const trimmed = $derived(typeof text === "string" ? text.trim() : "")
  const paras = $derived(trimmed ? paragraphs(trimmed) : [])
  const isBlockHtml = $derived(trimmed ? looksLikeBlockHtml(trimmed) : false)
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if paras.length > 0}
  <div class="relative mt-3 [overflow-anchor:none]">
    <details class="disclosure" bind:open>
      <summary
        class="flex cursor-pointer select-none items-center justify-between gap-3 rounded-md border bg-background/50 px-3 py-2 text-sm"
      >
        <span class="min-w-0 truncate font-medium text-foreground">{title}</span>
        <span class={"text-xs tracking-wide " + (open ? "text-primary" : "text-muted-foreground")}>
          {open ? "shown" : "hidden"}
        </span>
      </summary>
    </details>

    {#if open}
      <div
        class="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 max-h-[min(42vh,340px)] overflow-auto rounded-md border bg-card p-3 font-story shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        role="region"
        aria-label={title}
      >
        {#if isBlockHtml}
          <div class="text-sm leading-relaxed text-muted-foreground"><RichText text={trimmed} mode="block" /></div>
        {:else}
          {#each paras as para, index (`${index}:${para}`)}
            <p class="text-sm leading-relaxed text-muted-foreground"><RichText text={para} mode="inline" /></p>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
{/if}
