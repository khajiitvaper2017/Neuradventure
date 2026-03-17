<script lang="ts">
  import { cn } from "@/utils.js"
  import type { NPCState } from "@/shared/types"
  import { Button } from "@/components/ui/button"
  import * as Card from "@/components/ui/card"
  import { Trash } from "@lucide/svelte"

  type Props = {
    npc: NPCState
    deleting?: boolean
    deleteDisabled?: boolean
    showLocation?: boolean
    showActivity?: boolean
    onOpen: (npc: NPCState) => void
    onDelete: (npc: NPCState) => void
  }

  let {
    npc,
    deleting = false,
    deleteDisabled = false,
    showLocation = true,
    showActivity = true,
    onOpen,
    onDelete,
  }: Props = $props()

  function handleOpen() {
    onOpen(npc)
  }

  function handleDelete(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onDelete(npc)
  }
</script>

<Card.Root
  class={cn(
    "group cursor-pointer overflow-hidden shadow-sm transition-colors hover:bg-muted/20 p-0 gap-0",
    deleting && "opacity-60",
  )}
  role="listitem"
  tabindex={0}
  aria-label={`Open ${npc.name}`}
  onclick={handleOpen}
  onkeydown={(e) => {
    if (e.key !== "Enter" && e.key !== " ") return
    e.preventDefault()
    handleOpen()
  }}
>
  <Card.Header class="px-3 py-3">
    <Card.Title class="truncate text-sm font-semibold text-foreground">{npc.name}</Card.Title>
    <Card.Description class="mt-0.5 text-xs text-muted-foreground">{npc.gender} · {npc.race}</Card.Description>
    <Card.Action>
      <Button
        variant="ghost"
        size="icon"
        class="h-9 w-9 text-muted-foreground hover:text-destructive"
        onclick={handleDelete}
        disabled={deleteDisabled}
        aria-label={`Delete ${npc.name}`}
        title="Delete"
      >
        <Trash size={15} strokeWidth={1.8} aria-hidden="true" />
      </Button>
    </Card.Action>
  </Card.Header>

  {#if (showLocation && npc.current_location) || (showActivity && npc.current_activity) || npc.inventory?.length > 0}
    <Card.Content class="px-3 pb-3 pt-0">
      <div class="space-y-1 text-[11px] text-muted-foreground">
        {#if showLocation && npc.current_location}
          <div>Location: {npc.current_location}</div>
        {/if}
        {#if showActivity && npc.current_activity}
          <div>Activity: {npc.current_activity}</div>
        {/if}
        {#if npc.inventory?.length > 0}
          <div>Inventory: {npc.inventory.length}</div>
        {/if}
      </div>
    </Card.Content>
  {/if}
</Card.Root>
