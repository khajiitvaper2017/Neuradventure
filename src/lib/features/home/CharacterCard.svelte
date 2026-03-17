<script lang="ts">
  import type { StoryCharacterGroup } from "@/shared/api-types"
  import { relativeTimeAgo, utcDateMs } from "@/utils/date"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent, CardHeader } from "@/components/ui/card"
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu"
  import { EllipsisVertical, FileText } from "@lucide/svelte"

  type Props = {
    group: StoryCharacterGroup
    onOpenDetails?: (characterId: number) => void
    onStartNewStory?: (group: StoryCharacterGroup) => void
    onOpenStory?: (storyId: number) => void
    onExport?: (group: StoryCharacterGroup, format: "neuradventure" | "tavern-card") => void
    onDelete?: (characterId: number) => void
  }

  let { group, onOpenDetails, onStartNewStory, onOpenStory, onExport, onDelete }: Props = $props()

  function lastPlayedAtIso(): string | null {
    if (group.stories.length === 0) return null
    let max = 0
    for (const story of group.stories) max = Math.max(max, utcDateMs(story.updated_at))
    return new Date(max).toISOString()
  }

  const traits = $derived(
    [...group.character.personality_traits, ...group.character.perks].map((t) => t.trim()).filter(Boolean),
  )

  const recentStories = $derived(
    group.stories
      .slice()
      .sort((a, b) => utcDateMs(b.updated_at) - utcDateMs(a.updated_at))
      .slice(0, 4),
  )

  const lastPlayedIso = $derived(lastPlayedAtIso())
</script>

<Card class="group relative overflow-hidden gap-0 py-0 shadow-sm transition-colors hover:bg-muted/20" role="listitem">
  <div
    class="pointer-events-none absolute inset-y-0 left-0 w-1 bg-primary/60 opacity-70 transition-opacity group-hover:opacity-100"
  ></div>

  <CardHeader class="px-4 py-4">
    <div class="flex items-start gap-3">
      <Button
        type="button"
        variant="ghost"
        class="h-auto min-w-0 flex-1 items-start justify-start gap-3 p-0 text-left hover:bg-transparent"
        onclick={() => onOpenDetails?.(group.id)}
        aria-label={`Open character ${group.character.name}`}
      >
        <div class="relative mt-0.5">
          {#if group.card?.avatar}
            <img
              class="h-12 w-12 rounded-xl border bg-muted object-cover shadow-sm ring-2 ring-primary/15"
              src={group.card.avatar}
              alt={`${group.character.name} avatar`}
              loading="lazy"
            />
          {:else}
            <div class="h-12 w-12 rounded-xl border bg-muted shadow-sm ring-2 ring-primary/10" aria-hidden="true"></div>
          {/if}
        </div>

        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div class="truncate text-sm font-semibold">{group.character.name}</div>
            {#if group.stories.length > 0}
              <Badge variant="outline" class="px-2 py-0 text-[11px] font-medium text-muted-foreground">
                {group.stories.length}
                {group.stories.length === 1 ? "story" : "stories"}
              </Badge>
            {:else}
              <Badge variant="outline" class="px-2 py-0 text-[11px] font-medium text-muted-foreground">Unused</Badge>
            {/if}
          </div>

          <div class="mt-0.5 text-xs text-muted-foreground">
            {group.character.gender} · {group.character.race}
            {#if lastPlayedIso}
              <span class="mx-1">·</span>
              Last played {relativeTimeAgo(lastPlayedIso)}
            {/if}
          </div>
        </div>
      </Button>

      <div class="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          class="h-8"
          onclick={() => onStartNewStory?.(group)}
          aria-label={`Start a new story with ${group.character.name}`}
        >
          New story
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <span class="sr-only">Character options</span>
            <EllipsisVertical size={15} strokeWidth={1.8} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-48">
            <DropdownMenuItem onSelect={() => onOpenDetails?.(group.id)}>
              <span class="inline-flex items-center gap-2">
                <FileText size={14} strokeWidth={1.6} aria-hidden="true" />
                Details
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onStartNewStory?.(group)}>New Story</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onExport?.(group, "tavern-card")}>Export ST</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport?.(group, "neuradventure")}>Export JSON</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem class="text-destructive focus:text-destructive" onSelect={() => onDelete?.(group.id)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </CardHeader>

  <CardContent class="px-4 pb-4 pt-0">
    <div class="grid gap-3">
      <div class="flex flex-wrap gap-1.5" aria-label="Traits">
        {#if traits.length === 0}
          <span class="text-xs text-muted-foreground">No traits yet</span>
        {:else}
          {#each traits.slice(0, 7) as trait, i (`${trait}-${i}`)}
            <Badge variant="secondary" class="px-2 py-0 text-[11px] font-medium">
              {trait}
            </Badge>
          {/each}
          {#if traits.length > 7}
            <Badge variant="outline" class="px-2 py-0 text-[11px] font-medium text-muted-foreground">
              +{traits.length - 7}
            </Badge>
          {/if}
        {/if}
      </div>

      {#if recentStories.length > 0}
        <div class="flex flex-wrap gap-1.5" aria-label="Recent stories">
          {#each recentStories as story (story.id)}
            <Badge variant="outline" class="max-w-full px-2 py-0 text-[11px] font-medium">
              <Button
                type="button"
                variant="ghost"
                class="h-auto max-w-full min-w-0 p-0 text-[11px] font-medium hover:bg-transparent"
                onclick={() => onOpenStory?.(story.id)}
                aria-label={`Open story ${story.title}`}
              >
                <span class="truncate">{story.title}</span>
              </Button>
            </Badge>
          {/each}
          {#if group.stories.length > recentStories.length}
            <Badge variant="outline" class="px-2 py-0 text-[11px] font-medium text-muted-foreground">
              +{group.stories.length - recentStories.length}
            </Badge>
          {/if}
        </div>
      {/if}

      {#if group.stories.length > 0}
        <details class="rounded-lg border bg-muted/20 p-3">
          <summary
            class="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            aria-label={`Show all stories for ${group.character.name}`}
          >
            All stories
            <span class="ml-1 rounded-full bg-background px-2 py-0.5 text-[11px]">{group.stories.length}</span>
          </summary>
          <div class="mt-3 grid gap-1">
            {#each group.stories
              .slice()
              .sort((a, b) => utcDateMs(b.updated_at) - utcDateMs(a.updated_at)) as story (story.id)}
              <Button
                type="button"
                variant="link"
                class="h-auto justify-start p-0 text-left text-sm font-normal text-foreground/90 hover:underline"
                onclick={() => onOpenStory?.(story.id)}
              >
                {story.title}
              </Button>
            {/each}
          </div>
        </details>
      {/if}
    </div>
  </CardContent>
</Card>
