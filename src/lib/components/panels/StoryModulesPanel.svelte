<script lang="ts">
  import type { StoryModules } from "@/shared/types"
  import { STORY_MODULE_META, STORY_MODULE_SECTIONS, type StoryModuleKey } from "@/shared/story-modules"
  import { cn } from "@/utils.js"
  import { Switch } from "@/components/ui/switch"
  import { Button } from "@/components/ui/button"
  import { Separator } from "@/components/ui/separator"
  import { SlidersHorizontal } from "@lucide/svelte"

  type Props = {
    modules: StoryModules
    setModules: (next: StoryModules) => void
    bare?: boolean
    onOpenPrompts?: (moduleKey: keyof StoryModules) => void
  }

  let { modules, setModules, bare = false, onOpenPrompts }: Props = $props()

  function updateModule<K extends StoryModuleKey>(key: K, value: boolean) {
    setModules({ ...modules, [key]: value })
  }
</script>

{#snippet Section(section)}
  <div class="space-y-0">
    <div class={cn(bare ? "pb-2 pt-0" : "p-4 pb-2 pt-3")}>
      <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</div>
    </div>
    <div class={cn(bare ? "space-y-0" : "px-4 pb-3")}>
      {#each section.keys as key (key)}
        {@const meta = STORY_MODULE_META[key]}
        {@const gatedDisabled = meta.requiresTrackNpcs && !modules.track_npcs}
        <div
          class={cn(
            "flex items-start justify-between gap-4 border-b py-3 last:border-b-0",
            gatedDisabled && "opacity-60",
          )}
          aria-disabled={gatedDisabled}
        >
          <div class="min-w-0 flex-1 space-y-1">
            <div class="text-sm font-medium text-foreground">{meta.title}</div>
            {#if meta.sub}
              <div class="text-xs text-muted-foreground">{meta.sub}</div>
            {/if}
          </div>
          <div class="flex items-center justify-end">
            <div class="inline-flex items-center gap-2 rounded-md border bg-card/50 p-1">
              <Switch
                checked={Boolean(modules[key])}
                disabled={gatedDisabled}
                onCheckedChange={(v) => updateModule(key, v)}
                aria-label={`Toggle ${meta.title}`}
              />
              {#if onOpenPrompts}
                <Separator orientation="vertical" class="h-6" />
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 gap-1 px-2 text-xs"
                  onclick={() => onOpenPrompts?.(key)}
                  aria-label={`Edit prompts for ${meta.title}`}
                >
                  <SlidersHorizontal class="size-3.5" aria-hidden="true" />
                  Prompts
                </Button>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
{/snippet}

<div class={cn(!bare && "rounded-lg border bg-card")}>
  <div class={cn(bare ? "space-y-6" : "divide-y divide-border")}>
    {#each STORY_MODULE_SECTIONS as section (section.id)}
      {@render Section(section)}
    {/each}
  </div>
</div>
