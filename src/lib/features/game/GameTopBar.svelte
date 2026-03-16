<script lang="ts">
  import { stories } from "@/services/stories"
  import { cn } from "@/utils.js"
  import { EllipsisVertical, MapPin, User, Users } from "@lucide/svelte"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu"
  import { showCharSheet, showLocations, showNPCTracker } from "@/stores/router"
  import { collapseCharSheet, collapseLocationsPanel, collapseNPCTracker } from "@/stores/ui"
  import { currentStoryId, currentStoryModules, currentStoryTitle, turns, worldState } from "@/stores/game"

  type Props = {
    flashScene?: boolean
    onGoHome?: () => void
    onOpenMemoryEditor?: () => void
    onOpenWorldFieldsEditor?: () => void
    onOpenAuthorNoteEditor?: () => void
    onOpenModulesEditor?: () => void
  }

  let {
    flashScene = false,
    onGoHome,
    onOpenMemoryEditor,
    onOpenWorldFieldsEditor,
    onOpenAuthorNoteEditor,
    onOpenModulesEditor,
  }: Props = $props()

  let showMenu = $state(false)
  const trackNpcs = $derived($currentStoryModules?.track_npcs ?? true)
  const trackLocations = $derived($currentStoryModules?.track_locations ?? true)

  async function exportStory(format: "neuradventure" | "tavern" | "plaintext") {
    showMenu = false
    if (!$currentStoryId) return
    try {
      await stories.exportAndDownload($currentStoryId, format)
    } catch (err) {
      console.error("[export] Failed to export story", err)
    }
  }
</script>

<header class="flex min-h-12 items-center gap-2 border-b pr-2 min-[1200px]:pr-6">
  <Button
    variant="ghost"
    size="icon"
    class="h-12 w-12 shrink-0 rounded-none border-r text-muted-foreground hover:bg-accent hover:text-foreground"
    onclick={onGoHome}
    title="Return to menu"
    aria-label="Back to stories"
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg
    >
  </Button>

  <div class="flex min-w-0 flex-1 flex-col gap-0.5 py-2">
    <span class="break-words text-sm font-medium leading-snug text-foreground">{$currentStoryTitle}</span>
    {#if $worldState}
      <span
        class={cn(
          "break-words text-[11px] uppercase tracking-wider text-muted-foreground/80",
          flashScene && "animate-pulse",
        )}
      >
        {$worldState.current_scene} · {$worldState.time_of_day}
      </span>
    {/if}
  </div>

  <div class="flex shrink-0 items-center gap-1">
    <Badge variant="secondary" class="mr-1 font-mono text-xs tabular-nums">{$turns.length}</Badge>

    <Button
      variant="ghost"
      size="icon"
      class={cn("hidden h-9 w-9 text-muted-foreground min-[1200px]:inline-flex", $collapseCharSheet && "opacity-50")}
      title={$collapseCharSheet ? "Show character sheet" : "Hide character sheet"}
      onclick={() => collapseCharSheet.update((v) => !v)}
    >
      <User size={15} strokeWidth={1.8} aria-hidden="true" />
    </Button>
    {#if trackNpcs}
      <Button
        variant="ghost"
        size="icon"
        class={cn("hidden h-9 w-9 text-muted-foreground min-[1200px]:inline-flex", $collapseNPCTracker && "opacity-50")}
        title={$collapseNPCTracker ? "Show NPC tracker" : "Hide NPC tracker"}
        onclick={() => collapseNPCTracker.update((v) => !v)}
      >
        <Users size={15} strokeWidth={1.8} aria-hidden="true" />
      </Button>
    {/if}
    {#if trackLocations}
      <Button
        variant="ghost"
        size="icon"
        class={cn(
          "hidden h-9 w-9 text-muted-foreground min-[1200px]:inline-flex",
          $collapseLocationsPanel && "opacity-50",
        )}
        title={$collapseLocationsPanel ? "Show locations" : "Hide locations"}
        onclick={() => collapseLocationsPanel.update((v) => !v)}
      >
        <MapPin size={15} strokeWidth={1.8} aria-hidden="true" />
      </Button>
    {/if}
    <Button
      variant="ghost"
      size="icon"
      class="h-9 w-9 text-muted-foreground min-[1200px]:hidden"
      title="Character Sheet"
      onclick={() => showCharSheet.update((v) => !v)}
    >
      <User size={15} strokeWidth={1.8} aria-hidden="true" />
    </Button>
    {#if trackNpcs}
      <Button
        variant="ghost"
        size="icon"
        class="h-9 w-9 text-muted-foreground min-[1200px]:hidden"
        title="NPC Tracker"
        onclick={() => showNPCTracker.update((v) => !v)}
      >
        <Users size={15} strokeWidth={1.8} aria-hidden="true" />
      </Button>
    {/if}
    {#if trackLocations}
      <Button
        variant="ghost"
        size="icon"
        class="h-9 w-9 text-muted-foreground min-[1200px]:hidden"
        title="Locations"
        onclick={() => showLocations.update((v) => !v)}
      >
        <MapPin size={15} strokeWidth={1.8} aria-hidden="true" />
      </Button>
    {/if}
    <DropdownMenu open={showMenu} onOpenChange={(next) => (showMenu = next)}>
      <DropdownMenuTrigger
        class="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <span class="sr-only">More options</span>
        <EllipsisVertical size={15} strokeWidth={1.8} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-48">
        <DropdownMenuItem onSelect={() => onOpenMemoryEditor?.()}>Memory</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpenWorldFieldsEditor?.()}>World Fields</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpenAuthorNoteEditor?.()}>Author's Note</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpenModulesEditor?.()}>Story Modules</DropdownMenuItem>
        {#if $currentStoryId}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void exportStory("neuradventure")}>Export JSON</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportStory("tavern")}>Export ST Chat</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportStory("plaintext")}>Export Text</DropdownMenuItem>
        {/if}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</header>
