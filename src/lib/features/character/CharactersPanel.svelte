<script lang="ts">
  import { get } from "svelte/store"
  import { AppError } from "@/errors"
  import { stories } from "@/services/stories"
  import { turns as turnsService } from "@/services/turns"
  import { showCharactersPanel, showCharSheet } from "@/stores/router"
  import { showConfirm, showError, showQuietNotice } from "@/stores/ui"
  import {
    activeStoryCharacterKey,
    currentStoryId,
    currentStoryModules,
    isGenerating,
    markLlmUpdate,
    npcs,
  } from "@/stores/game"
  import type { NPCState } from "@/shared/types"
  import { createRequestId } from "@/utils/ids"
  import { cn } from "@/utils.js"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent } from "@/components/ui/card"
  import { Sheet, SheetContent } from "@/components/ui/sheet"
  import { ScrollArea } from "@/components/ui/scroll-area"
  import { Trash, Users } from "@lucide/svelte"
  import AddCharacterCard from "@/features/character/AddCharacterCard.svelte"

  let { inline = false }: { inline?: boolean } = $props()

  const trackNpcs = $derived($currentStoryModules?.track_npcs ?? true)

  let newName = $state("")
  let adding = $state(false)
  let deletingName = $state<string | null>(null)

  function openNpc(npc: NPCState) {
    activeStoryCharacterKey.set(`npc:${npc.name}`)
    showCharSheet.set(true)
  }

  async function addCharacter() {
    if ($isGenerating || adding) return
    if (!$currentStoryId) {
      showError("No active story to update.")
      return
    }
    const name = newName.trim()
    if (!name) return
    if ($npcs.some((npc) => npc.name.toLowerCase() === name.toLowerCase())) {
      showError(`Character "${name}" already exists.`)
      return
    }

    adding = true
    isGenerating.set(true)
    try {
      const result = await turnsService.createNpc($currentStoryId, name, createRequestId())
      npcs.set(result.npcs)
      markLlmUpdate()
      newName = ""
      showQuietNotice(`Added character: ${result.npc.name}.`)
    } catch (err) {
      if (err instanceof AppError) showError(err.message)
      else showError("Failed to add character. Is KoboldCpp running?")
    } finally {
      adding = false
      isGenerating.set(false)
    }
  }

  async function deleteNpc(npc: NPCState) {
    if (!$currentStoryId) {
      showError("No active story to update.")
      return
    }
    if ($isGenerating || adding || deletingName) return

    const confirmed = await showConfirm({
      title: "Delete character",
      message: `Delete ${npc.name}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    })
    if (!confirmed) return

    deletingName = npc.name
    try {
      const updated = $npcs.filter((entry) => entry.name !== npc.name)
      const result = await stories.updateState($currentStoryId, { npcs: updated })
      npcs.set(result.npcs)
      showQuietNotice("Character deleted.")
      if (get(activeStoryCharacterKey) === `npc:${npc.name}`) {
        activeStoryCharacterKey.set("player")
      }
    } catch (err) {
      if (err instanceof AppError) showError(err.message)
      else showError("Failed to delete character.")
    } finally {
      deletingName = null
    }
  }
</script>

{#snippet roster()}
  <div class="flex h-dvh flex-col overflow-hidden bg-card">
    <div class="flex items-center justify-between gap-3 border-b px-4 py-3">
      <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Users size={16} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
        <span>Characters</span>
        <Badge variant="outline" class="rounded-full font-mono text-[11px]">{Math.max(0, $npcs.length)}</Badge>
      </div>
      {#if !inline}
        <Button
          variant="ghost"
          size="icon"
          class="h-9 w-9"
          onclick={() => showCharactersPanel.set(false)}
          aria-label="Close">×</Button
        >
      {/if}
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <div class="grid gap-3 p-4">
        <AddCharacterCard
          value={newName}
          busy={adding}
          disabled={!trackNpcs || !$currentStoryId}
          onInput={(v) => (newName = v)}
          onAdd={addCharacter}
        />

        {#if !trackNpcs}
          <div class="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
            Character tracking is disabled in story modules.
          </div>
        {:else if $npcs.length === 0}
          <div class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No other characters yet.
          </div>
        {:else}
          <div class="grid gap-2" role="list" aria-label="Characters">
            {#each $npcs as npc (npc.name)}
              <Card
                class={cn(
                  "group cursor-pointer overflow-hidden shadow-sm transition-colors hover:bg-muted/20",
                  deletingName === npc.name && "opacity-60",
                )}
                role="listitem"
                onclick={() => openNpc(npc)}
              >
                <CardContent class="flex items-start justify-between gap-3 p-3">
                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold text-foreground">{npc.name}</div>
                    <div class="mt-0.5 text-xs text-muted-foreground">{npc.gender} · {npc.race}</div>
                    {#if npc.inventory?.length > 0}
                      <div class="mt-2 text-[11px] text-muted-foreground">Inventory: {npc.inventory.length}</div>
                    {/if}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-9 w-9 text-muted-foreground hover:text-destructive"
                    onclick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void deleteNpc(npc)
                    }}
                    disabled={deletingName !== null || $isGenerating}
                    aria-label={`Delete ${npc.name}`}
                    title="Delete"
                  >
                    <Trash size={15} strokeWidth={1.8} aria-hidden="true" />
                  </Button>
                </CardContent>
              </Card>
            {/each}
          </div>
        {/if}
      </div>
    </ScrollArea>
  </div>
{/snippet}

{#if inline}
  {@render roster()}
{:else}
  <Sheet open={$showCharactersPanel} onOpenChange={(next) => showCharactersPanel.set(next)}>
    <SheetContent side="right" class="p-0">
      {@render roster()}
    </SheetContent>
  </Sheet>
{/if}
