<script lang="ts">
  import IconTrash from "@/components/icons/IconTrash.svelte"
  import { Button } from "@/components/ui/button"

  const noop = (_value: string) => {
    // no-op
  }

  type Props = {
    items?: string[]
    label?: string
    limit?: number
    onUse?: (value: string) => void
    onDelete?: (value: string) => void
  }

  let { items = [], label = "Recent prompts", limit = 6, onUse = noop, onDelete = noop }: Props = $props()
</script>

{#if items.length > 0}
  <div class="mt-3 space-y-2">
    <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
    <div class="space-y-2">
      {#each items.slice(0, limit) as item (item)}
        <div class="flex items-center gap-2 rounded-md border bg-background/50 p-2">
          <Button
            variant="ghost"
            size="sm"
            class="h-auto min-w-0 flex-1 justify-start px-2 py-1 text-left text-xs font-normal"
            onclick={() => onUse(item)}
            title={item}
          >
            <span class="truncate">{item}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 text-muted-foreground hover:text-foreground"
            onclick={() => onDelete(item)}
            aria-label="Delete prompt"
            title="Delete prompt"
          >
            <IconTrash size={14} strokeWidth={2} className="text-current" />
          </Button>
        </div>
      {/each}
    </div>
  </div>
{/if}
