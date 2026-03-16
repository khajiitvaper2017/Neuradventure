<script lang="ts">
  import type { StoryModules } from "@/shared/types"
  import { cn } from "@/utils.js"
  import { Switch } from "@/components/ui/switch"
  import { Button } from "@/components/ui/button"

  type Props = {
    modules: StoryModules
    setModules: (next: StoryModules) => void
    bare?: boolean
    onOpenPrompts?: (moduleKey: keyof StoryModules) => void
  }

  let { modules, setModules, bare = false, onOpenPrompts }: Props = $props()

  function updateModule<K extends keyof StoryModules>(key: K, value: StoryModules[K]) {
    setModules({ ...modules, [key]: value })
  }

  type Row = { key: keyof StoryModules; title: string; sub?: string; gatedByTrackNpcs?: boolean }

  const CORE: Row[] = [
    { key: "track_npcs", title: "Track NPCs", sub: "New stories track NPC state and updates" },
    { key: "track_locations", title: "Track locations", sub: "New stories track location lists and presence" },
    {
      key: "track_background_events",
      title: "Track background events",
      sub: "Generate hidden off-screen events per turn",
    },
  ]

  const PLAYER: Row[] = [
    {
      key: "character_appearance_clothing",
      title: "Player appearance + clothing",
      sub: "Show and update appearance/clothing fields",
    },
    { key: "character_personality_traits", title: "Player personality traits" },
    { key: "character_major_flaws", title: "Player major flaws" },
    { key: "character_perks", title: "Player perks" },
    { key: "character_inventory", title: "Player inventory" },
  ]

  const NPC: Row[] = [
    { key: "npc_appearance_clothing", title: "NPC appearance + clothing", gatedByTrackNpcs: true },
    { key: "npc_personality_traits", title: "NPC personality traits", gatedByTrackNpcs: true },
    { key: "npc_major_flaws", title: "NPC major flaws", gatedByTrackNpcs: true },
    { key: "npc_perks", title: "NPC perks", gatedByTrackNpcs: true },
    { key: "npc_location", title: "NPC location", gatedByTrackNpcs: true },
    { key: "npc_activity", title: "NPC activity", gatedByTrackNpcs: true },
  ]
</script>

{#snippet Section(title, rows)}
  <div class={cn(bare ? "space-y-0" : "space-y-0")}>
    <div class={cn(bare ? "pb-2 pt-0" : "p-4 pb-2 pt-3")}>
      <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
    </div>
    <div class={cn(bare ? "space-y-0" : "px-4 pb-3")}>
      {#each rows as row (row.key)}
        {@const gatedDisabled = row.gatedByTrackNpcs && !modules.track_npcs}
        <div
          class={cn(
            "flex items-start justify-between gap-4 border-b py-3 last:border-b-0",
            gatedDisabled && "opacity-60",
          )}
          aria-disabled={gatedDisabled}
        >
          <div class="min-w-0 flex-1 space-y-1">
            <div class="text-sm font-medium text-foreground">{row.title}</div>
            {#if row.sub}
              <div class="text-xs text-muted-foreground">{row.sub}</div>
            {/if}
          </div>
          <div class="flex items-center gap-2">
            {#if onOpenPrompts}
              <Button
                variant="outline"
                size="sm"
                class="h-8"
                onclick={() => onOpenPrompts?.(row.key)}
                aria-label={`Edit prompts for ${row.title}`}
              >
                Prompts
              </Button>
            {/if}
            <Switch
              checked={Boolean(modules[row.key])}
              disabled={gatedDisabled}
              onCheckedChange={(v) => updateModule(row.key, v as StoryModules[keyof StoryModules])}
            />
          </div>
        </div>
      {/each}
    </div>
  </div>
{/snippet}

<div class={cn(!bare && "rounded-lg border bg-card")}>
  <div class={cn(bare ? "space-y-6" : "divide-y divide-border")}>
    {@render Section("Core", CORE)}
    {@render Section("Player", PLAYER)}
    {@render Section("NPCs", NPC)}
  </div>
</div>
