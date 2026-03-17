<script lang="ts">
  import type { StoryCharacterGroup } from "@/types/api"
  import { relativeTimeAgo, utcDateMs } from "@/utils/date"
  import * as Avatar from "@/components/ui/avatar"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import * as Card from "@/components/ui/card"
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
  const avatarSrc = $derived((group.card?.avatar ?? "").trim())
</script>

<Card.Root
  class="group relative overflow-hidden gap-0 py-0 shadow-sm transition-colors hover:bg-muted/20"
  role="listitem"
>
  <div
    class="pointer-events-none absolute inset-y-0 left-0 w-1 bg-primary/60 opacity-70 transition-opacity group-hover:opacity-100"
  ></div>

  <Card.Header class="px-4 py-4">
    <Button
      type="button"
      variant="ghost"
      class="col-start-1 row-span-2 row-start-1 h-auto min-w-0 items-start justify-start gap-3 p-0 text-left hover:bg-transparent"
      onclick={() => onOpenDetails?.(group.id)}
      aria-label={`Open character ${group.character.name}`}
    >
      {#if avatarSrc}
        <Avatar.Root class="mt-0.5 size-12 rounded-xl border bg-muted shadow-sm ring-2 ring-primary/15">
          <Avatar.Image src={avatarSrc} alt={`${group.character.name} avatar`} class="object-cover" />
        </Avatar.Root>
      {/if}

      <div class="min-w-0">
        <Card.Title class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span class="truncate">{group.character.name}</span>
          {#if group.stories.length > 0}
            <Badge
              variant="outline"
              class="border-primary/30 bg-primary/5 px-2 py-0 text-[11px] font-medium text-primary"
            >
              {group.stories.length}
              {group.stories.length === 1 ? "story" : "stories"}
            </Badge>
          {:else}
            <Badge variant="outline" class="px-2 py-0 text-[11px] font-medium text-muted-foreground">Unused</Badge>
          {/if}
        </Card.Title>

        <Card.Description class="mt-0.5 text-xs">
          {group.character.gender} · {group.character.race}
          {#if lastPlayedIso}
            <span class="mx-1">·</span>
            Last played {relativeTimeAgo(lastPlayedIso)}
          {/if}
        </Card.Description>
      </div>
    </Button>

    <Card.Action class="flex items-center gap-1">
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
    </Card.Action>
  </Card.Header>

  <Card.Content class="px-4 pb-4 pt-0">
    <div class="grid gap-3">
      <div class="flex flex-wrap gap-1.5" aria-label="Traits">
        {#if traits.length === 0}
          <span class="text-xs text-muted-foreground">No traits yet</span>
        {:else}
          {#each traits.slice(0, 7) as trait, i (`${trait}-${i}`)}
            <Badge variant="secondary" class="bg-muted/50 px-2 py-0 text-[11px] font-medium text-muted-foreground">
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
            <Badge
              variant="outline"
              class="max-w-full border-primary/30 bg-primary/5 px-2 py-0 text-[11px] font-medium text-primary"
            >
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
            <Badge
              variant="outline"
              class="border-primary/30 bg-primary/5 px-2 py-0 text-[11px] font-medium text-primary/80"
            >
              +{group.stories.length - recentStories.length}
            </Badge>
          {/if}
        </div>
      {/if}
    </div>
  </Card.Content>

  <Card.Footer class="justify-end gap-2 px-4 pb-4 pt-0">
    <Button
      type="button"
      size="sm"
      class="h-8"
      onclick={() => onStartNewStory?.(group)}
      aria-label={`Start a new story with ${group.character.name}`}
    >
      New story
    </Button>
  </Card.Footer>
</Card.Root>
