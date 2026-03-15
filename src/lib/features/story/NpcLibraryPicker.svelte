<script lang="ts">
  import type { StoryCharacterGroup } from "@/shared/api-types"
  import { cn } from "@/utils.js"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"

  export let characters: StoryCharacterGroup[] = []
  export let selectedIds: number[] = []
  export let disabled = false
  export let locked = false
  export let excludeCharacterId: number | null = null
  export let onChange: (nextIds: number[]) => void = () => {}
  export let onOpenModules: (() => void) | undefined = undefined

  let query = ""

  function isSelected(id: number): boolean {
    return selectedIds.includes(id)
  }

  function isExcluded(id: number): boolean {
    return !!excludeCharacterId && id === excludeCharacterId
  }

  function toggle(id: number) {
    if (disabled || locked) return
    if (isExcluded(id)) return
    if (isSelected(id)) {
      onChange(selectedIds.filter((x) => x !== id))
      return
    }
    onChange([...selectedIds, id])
  }

  function remove(id: number) {
    if (disabled || locked) return
    onChange(selectedIds.filter((x) => x !== id))
  }

  function matches(group: StoryCharacterGroup, q: string): boolean {
    if (!q) return true
    const c = group.character
    const traits = [...c.personality_traits, ...c.quirks, ...c.perks].join(" ")
    return `${c.name} ${c.race} ${c.gender} ${traits}`.toLowerCase().includes(q)
  }

  $: q = query.trim().toLowerCase()
  $: filtered = characters.filter((g) => matches(g, q))
  $: selectedGroups = selectedIds
    .map((id) => characters.find((g) => g.id === id) ?? null)
    .filter((g): g is StoryCharacterGroup => !!g)
</script>

<div class="rounded-lg border bg-background p-4" aria-label="NPCs from library">
  <div class="mb-3 flex items-baseline justify-between gap-3">
    <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">NPCs from Library</div>
    <div class="font-mono text-xs text-muted-foreground/80">{selectedIds.length} selected</div>
  </div>

  {#if disabled}
    <div class="rounded-lg border border-dashed bg-card p-4 text-sm" role="note">
      <div class="font-medium text-foreground">NPC tracking is off.</div>
      <div class="mt-0.5 text-sm text-muted-foreground">Enable it in Story Modules to add NPCs at creation.</div>
      {#if onOpenModules}
        <Button variant="outline" class="mt-3 w-full" onclick={onOpenModules}>Edit modules</Button>
      {/if}
    </div>
  {:else}
    <div class="mb-3">
      <Label class="sr-only" for="npc-library-search">Search characters</Label>
      <Input
        id="npc-library-search"
        type="search"
        placeholder="Search characters…"
        bind:value={query}
        disabled={locked}
      />
    </div>

    {#if selectedGroups.length > 0}
      <div class="mb-3 flex flex-wrap gap-2" aria-label="Selected NPC characters">
        {#each selectedGroups as group (group.id)}
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="h-8 rounded-full border-primary bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary/15"
            onclick={() => remove(group.id)}
            aria-label={`Remove ${group.character.name}`}
            disabled={locked}
          >
            <span>{group.character.name}</span>
            <span class="opacity-80" aria-hidden="true">×</span>
          </Button>
        {/each}
      </div>
    {/if}

    <ul class="grid max-h-64 gap-2 overflow-auto pr-1" aria-label="Characters">
      {#if characters.length === 0}
        <li
          class="grid place-items-center rounded-md border bg-card p-4 text-center text-sm text-muted-foreground italic"
          role="status"
        >
          No saved characters yet.
        </li>
      {:else if filtered.length === 0}
        <li
          class="grid place-items-center rounded-md border bg-card p-4 text-center text-sm text-muted-foreground italic"
          role="status"
        >
          No matches.
        </li>
      {:else}
        {#each filtered as group (group.id)}
          {@const selected = isSelected(group.id)}
          {@const excluded = isExcluded(group.id)}
          <li>
            <Button
              class={cn(
                "h-auto w-full justify-between gap-3 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:border-ring hover:bg-card disabled:cursor-not-allowed disabled:opacity-50",
                selected && "border-primary bg-primary/10",
              )}
              type="button"
              variant="ghost"
              onclick={() => toggle(group.id)}
              disabled={excluded || locked}
              aria-label={`${selected ? "Remove" : "Add"} ${group.character.name} as NPC${excluded ? " (player character)" : ""}`}
            >
              <div class="min-w-0">
                <div class="flex min-w-0 items-center gap-2">
                  <div class="truncate text-sm font-medium text-foreground">{group.character.name}</div>
                  {#if excluded}
                    <Badge
                      variant="outline"
                      class="font-mono text-[11px]"
                      title="This is your selected player character"
                    >
                      Player
                    </Badge>
                  {/if}
                </div>
                <div class="mt-0.5 truncate text-xs text-muted-foreground">
                  {(group.character.race || "Unknown").trim()} · {(group.character.gender || "Unknown").trim()}
                </div>
              </div>
              <Badge variant={selected ? "secondary" : "outline"} class="shrink-0 font-mono text-[11px]">
                {selected ? "Selected" : "Add"}
              </Badge>
            </Button>
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</div>
