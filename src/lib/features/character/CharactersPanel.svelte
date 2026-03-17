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
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Sheet, SheetContent } from "@/components/ui/sheet"
  import { ScrollArea } from "@/components/ui/scroll-area"
  import { Users } from "@lucide/svelte"
  import AddCharacterCard from "@/features/character/AddCharacterCard.svelte"
  import NpcCard from "@/features/character/NpcCard.svelte"

  let { inline = false }: { inline?: boolean } = $props()

  const trackNpcs = $derived($currentStoryModules?.track_npcs ?? true)
  const showNpcLocation = $derived($currentStoryModules?.npc_location ?? true)
  const showNpcActivity = $derived($currentStoryModules?.npc_activity ?? true)

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
              <NpcCard
                {npc}
                deleting={deletingName === npc.name}
                deleteDisabled={deletingName !== null || $isGenerating}
                showLocation={showNpcLocation}
                showActivity={showNpcActivity}
                onOpen={openNpc}
                onDelete={(target) => void deleteNpc(target)}
              />
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
