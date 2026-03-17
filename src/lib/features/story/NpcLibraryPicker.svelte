<script lang="ts">
  import type { StoryCharacterGroup } from "@/shared/api-types"
  import { Button } from "@/components/ui/button"
  import MultiSelectPicker from "@/components/pickers/MultiSelectPicker.svelte"

  type Props = {
    characters?: StoryCharacterGroup[]
    selectedIds?: number[]
    disabled?: boolean
    locked?: boolean
    excludeCharacterId?: number | null
    onChange?: (nextIds: number[]) => void
    onOpenModules?: () => void
  }

  let {
    characters = [],
    selectedIds = [],
    disabled = false,
    locked = false,
    excludeCharacterId = null,
    onChange = () => {},
    onOpenModules,
  }: Props = $props()

  const pickerItems = $derived(
    characters.map((group) => ({
      id: String(group.id),
      name: group.character.name,
      description: `${(group.character.race || "Unknown").trim()} · ${(group.character.gender || "Unknown").trim()}`,
      avatar: group.card?.avatar ?? null,
    })),
  )

  const pickerSelectedIds = $derived(selectedIds.map(String))
  const excludeKey = $derived(excludeCharacterId != null ? String(excludeCharacterId) : null)

  function onPickerChange(nextIds: string[]) {
    const next = nextIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0 && (excludeCharacterId == null || id !== excludeCharacterId))
    onChange(next)
  }
</script>

{#if disabled}
  <div class="rounded-lg border bg-background p-4" aria-label="NPCs from library">
    <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">NPCs from Library</div>
    <div class="mt-3 rounded-lg border border-dashed bg-card p-4 text-sm" role="note">
      <div class="font-medium text-foreground">NPC tracking is off.</div>
      <div class="mt-0.5 text-sm text-muted-foreground">Enable it in Story Modules to add NPCs at creation.</div>
      {#if onOpenModules}
        <Button variant="outline" class="mt-3 w-full" onclick={onOpenModules}>Edit modules</Button>
      {/if}
    </div>
  </div>
{:else}
  <MultiSelectPicker
    title="NPCs from Library"
    ariaLabel="NPCs from library"
    items={pickerItems}
    selectedIds={pickerSelectedIds}
    locked={locked}
    excludeIds={excludeKey ? [excludeKey] : []}
    excludeBadgeLabel="Player"
    searchPlaceholder="Search characters…"
    emptyText="No saved characters yet."
    noMatchesText="No matches."
    onChange={onPickerChange}
  />
{/if}
