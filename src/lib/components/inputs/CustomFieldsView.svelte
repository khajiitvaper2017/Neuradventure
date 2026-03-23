<script lang="ts">
  import type { CustomFieldDef } from "@/types/api"
  import { cn } from "@/utils.js"

  type Props = {
    defs: CustomFieldDef[]
    values: Record<string, string | string[]>
    scope: "character" | "world"
    placement: CustomFieldDef["placement"]
    emptyText?: string
    class?: string
  }

  let { defs, values, scope, placement, emptyText = "", class: className }: Props = $props()

  const visibleDefs = $derived(defs.filter((d) => d.enabled && d.scope === scope && d.placement === placement))

  function valueLabel(value: string | string[]): string {
    return Array.isArray(value) ? value.join(", ") : value
  }

  const lines = $derived.by(() => {
    const out: Array<{ id: string; label: string; value: string }> = []
    for (const def of visibleDefs) {
      const value = values[def.id]
      if (value === undefined) continue
      const rendered = valueLabel(value).trim()
      if (!rendered) continue
      out.push({ id: def.id, label: def.label, value: rendered })
    }
    return out
  })
</script>

{#if lines.length === 0}
  {#if emptyText}
    <div class={cn("text-sm text-muted-foreground", className)}>{emptyText}</div>
  {/if}
{:else}
  <div class={cn("space-y-2", className)}>
    {#each lines as line (line.id)}
      <div class="text-sm leading-snug text-foreground">
        <span class="font-medium">{line.label}</span>
        <span class="text-muted-foreground"> ({line.id})</span>: {line.value}
      </div>
    {/each}
  </div>
{/if}
