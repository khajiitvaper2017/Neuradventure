<script lang="ts">
  import { showLocations } from "@/stores/router"
  import { worldState } from "@/stores/game"
  import type { Location } from "@/shared/types"
  import { cn } from "@/utils.js"
  import { Box, FileText, MapPin, Users } from "@lucide/svelte"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Sheet, SheetContent } from "@/components/ui/sheet"
  import { ScrollArea } from "@/components/ui/scroll-area"

  let { inline = false }: { inline?: boolean } = $props()

  const currentSceneKey = $derived($worldState?.current_scene?.trim().toLowerCase() ?? "")

  const sortedLocations = $derived(
    (() => {
      const ws = $worldState
      if (!ws) return [] as Location[]
      const locations = ws.locations ?? []
      const current = ws.current_scene.trim().toLowerCase()
      return [...locations].sort((a, b) => {
        const aCurrent = a.name.trim().toLowerCase() === current
        const bCurrent = b.name.trim().toLowerCase() === current
        if (aCurrent && !bCurrent) return -1
        if (!aCurrent && bCurrent) return 1
        return a.name.localeCompare(b.name)
      })
    })(),
  )

  function listLabel(items: string[]): string {
    return items.length > 0 ? items.join(", ") : "none"
  }

  function itemLabel(items: Location["available_items"]): string {
    return items.length > 0 ? items.map((item) => `${item.name} (${item.description})`).join(", ") : "none"
  }
</script>

{#snippet LocationsBody()}
  {#if !$worldState}
    <div class="grid place-items-center rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      No active story.
    </div>
  {:else if sortedLocations.length === 0}
    <div class="grid place-items-center rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      No locations yet.
    </div>
  {:else}
    <div class="space-y-3">
      {#each sortedLocations as location (location.name)}
        {@const isCurrent = location.name.trim().toLowerCase() === currentSceneKey}
        <div class={cn("rounded-lg border bg-card/50 p-3", isCurrent && "border-primary/70 ring-1 ring-primary/30")}>
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-foreground">{location.name}</div>
            </div>
            {#if isCurrent}
              <Badge variant="secondary" class="text-[10px] uppercase tracking-wider">Current</Badge>
            {/if}
          </div>

          <div class="mt-2 space-y-2">
            <div class="flex items-start gap-2 text-xs leading-snug text-foreground/90">
              <FileText size={13} strokeWidth={1.5} class="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{location.description}</span>
            </div>

            <div class="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
              <Users size={13} strokeWidth={1.5} class="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{listLabel(location.characters)}</span>
            </div>

            <div class="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
              <Box size={13} strokeWidth={1.5} class="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{itemLabel(location.available_items)}</span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

{#if inline}
  <div class="flex h-dvh flex-col overflow-hidden border-r bg-card">
    <div
      class="flex items-center gap-2 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
    >
      <MapPin size={16} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
      <span>Locations ({sortedLocations.length})</span>
    </div>
    <ScrollArea class="min-h-0 flex-1">
      <div class="p-4">
        {@render LocationsBody()}
      </div>
    </ScrollArea>
  </div>
{:else if $showLocations}
  <Sheet open={$showLocations} onOpenChange={(next) => showLocations.set(next)}>
    <SheetContent side="right" class="p-0">
      <div class="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div class="flex min-w-0 items-center gap-2">
          <MapPin size={16} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
          <div class="truncate text-sm font-semibold text-foreground">Locations ({sortedLocations.length})</div>
        </div>
        <Button variant="ghost" size="icon" class="h-9 w-9" onclick={() => showLocations.set(false)} aria-label="Close">
          ×
        </Button>
      </div>
      <ScrollArea class="max-h-[calc(100dvh-3.25rem)]">
        <div class="p-4">
          {@render LocationsBody()}
        </div>
      </ScrollArea>
    </SheetContent>
  </Sheet>
{/if}
