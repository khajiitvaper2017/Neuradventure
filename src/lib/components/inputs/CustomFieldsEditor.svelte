<script lang="ts">
  import type { CustomFieldDef } from "@/types/api"
  import { cn } from "@/utils.js"
  import { Button } from "@/components/ui/button"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"
  import { Textarea } from "@/components/ui/textarea"

  type Props = {
    defs: CustomFieldDef[]
    values: Record<string, string | string[]>
    setValues: (next: Record<string, string | string[]>) => void
    scope: "character" | "world"
    placement: CustomFieldDef["placement"]
    disabled?: boolean
    class?: string
  }

  let { defs, values, setValues, scope, placement, disabled = false, class: className }: Props = $props()

  const visibleDefs = $derived(defs.filter((d) => d.enabled && d.scope === scope && d.placement === placement))

  function setText(id: string, next: string) {
    const trimmed = next.trim()
    const out = { ...values }
    if (!trimmed) delete out[id]
    else out[id] = trimmed
    setValues(out)
  }

  function setList(id: string, next: string[]) {
    const cleaned = next.map((s) => s.trim()).filter((s) => s.length > 0)
    const out = { ...values }
    if (cleaned.length === 0) delete out[id]
    else out[id] = cleaned
    setValues(out)
  }

  function listValue(id: string): string[] {
    const v = values[id]
    return Array.isArray(v) ? v : []
  }

  function addListItem(id: string) {
    setList(id, [...listValue(id), ""])
  }

  function updateListItem(id: string, index: number, next: string) {
    const current = listValue(id)
    const updated = current.map((v, i) => (i === index ? next : v))
    setList(id, updated)
  }

  function removeListItem(id: string, index: number) {
    const current = listValue(id)
    setList(
      id,
      current.filter((_, i) => i !== index),
    )
  }
</script>

<div class={cn("space-y-4", className)}>
  {#if visibleDefs.length === 0}
    <div class="text-sm text-muted-foreground">No fields.</div>
  {:else}
    {#each visibleDefs as def (def.id)}
      <div class="space-y-2">
        <Label>
          {def.label} <span class="font-mono text-xs text-muted-foreground">({def.id})</span>
        </Label>

        {#if def.value_type === "text"}
          <Textarea
            rows={3}
            value={typeof values[def.id] === "string" ? (values[def.id] as string) : ""}
            oninput={(e) => setText(def.id, (e.target as HTMLTextAreaElement).value)}
            {disabled}
          />
        {:else}
          {@const items = listValue(def.id)}
          <div class="space-y-2">
            {#if items.length === 0}
              <div class="text-sm text-muted-foreground">No items.</div>
            {:else}
              {#each items as item, idx (idx)}
                <div class="grid grid-cols-[1fr_auto] items-center gap-2">
                  <Input
                    type="text"
                    value={item}
                    oninput={(e) => updateListItem(def.id, idx, (e.target as HTMLInputElement).value)}
                    {disabled}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    class="h-9 w-9 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onclick={() => removeListItem(def.id, idx)}
                    aria-label="Remove item"
                    {disabled}
                  >
                    ×
                  </Button>
                </div>
              {/each}
            {/if}
            <div>
              <Button variant="outline" size="sm" class="h-8" onclick={() => addListItem(def.id)} {disabled}>
                Add item
              </Button>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</div>
