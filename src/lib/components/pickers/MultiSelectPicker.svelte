<script lang="ts">
  import { FileText } from "@lucide/svelte"
  import { cn } from "@/utils.js"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"
  import * as Avatar from "@/components/ui/avatar"

  export type MultiSelectPickerItem = {
    id: string
    name: string
    description?: string
    avatar?: string | null
    tag?: string
    details?: boolean
    detailsTitle?: string
    detailsAriaLabel?: string
  }

  type Props = {
    title?: string
    ariaLabel?: string
    items?: MultiSelectPickerItem[]
    selectedIds?: string[]
    locked?: boolean
    excludeIds?: string[]
    excludeBadgeLabel?: string
    showHeader?: boolean
    searchPlaceholder?: string
    emptyText?: string
    noMatchesText?: string
    maxHeightClass?: string
    bare?: boolean
    class?: string
    onChange?: (nextIds: string[]) => void
    onDetails?: (item: MultiSelectPickerItem) => void
  }

  let {
    title = "Select items",
    ariaLabel,
    items = [],
    selectedIds = [],
    locked = false,
    excludeIds = [],
    excludeBadgeLabel = "Locked",
    showHeader = true,
    searchPlaceholder = "Search…",
    emptyText = "Nothing here yet.",
    noMatchesText = "No matches.",
    maxHeightClass = "max-h-64",
    bare = false,
    class: className,
    onChange,
    onDetails,
  }: Props = $props()

  let query = $state("")

  function isSelected(id: string): boolean {
    return selectedIds.includes(id)
  }

  function isExcluded(id: string): boolean {
    return excludeIds.includes(id)
  }

  function setSelected(nextIds: string[]) {
    const unique = Array.from(new Set(nextIds))
    onChange?.(unique)
  }

  function toggle(id: string) {
    if (locked) return
    if (isExcluded(id)) return
    if (isSelected(id)) {
      setSelected(selectedIds.filter((x) => x !== id))
      return
    }
    setSelected([...selectedIds, id])
  }

  function remove(id: string) {
    if (locked) return
    setSelected(selectedIds.filter((x) => x !== id))
  }

  function match(item: MultiSelectPickerItem, q: string): boolean {
    if (!q) return true
    const hay = `${item.name} ${item.tag ?? ""} ${item.description ?? ""}`.toLowerCase()
    return hay.includes(q)
  }

  const q = $derived(query.trim().toLowerCase())
  const filtered = $derived(items.filter((item) => match(item, q)))
  const selectedItems = $derived(
    selectedIds
      .map((id) => items.find((item) => item.id === id) ?? null)
      .filter((x): x is MultiSelectPickerItem => !!x),
  )
</script>

<div
  class={cn(!bare && "rounded-lg border bg-background p-4", className)}
  aria-label={ariaLabel ?? title}
  data-locked={locked ? "true" : undefined}
>
  {#if showHeader}
    <div class="mb-3 flex items-baseline justify-between gap-3">
      <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div class="font-mono text-xs text-muted-foreground/80">{selectedIds.length} selected</div>
    </div>
  {/if}

  <div class="mb-3">
    <Label class="sr-only">Search</Label>
    <Input type="search" placeholder={searchPlaceholder} bind:value={query} disabled={locked} aria-label="Search" />
  </div>

  {#if selectedItems.length > 0}
    <div class="mb-3 flex flex-wrap gap-2" aria-label="Selected items">
      {#each selectedItems as item (item.id)}
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="h-8 rounded-full border-primary bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary/15"
          onclick={() => remove(item.id)}
          aria-label={`Remove ${item.name}`}
          disabled={locked}
        >
          <span>{item.name}</span>
          <span class="opacity-80" aria-hidden="true">×</span>
        </Button>
      {/each}
    </div>
  {/if}

  <ul class={cn("grid gap-2 overflow-auto pr-1", maxHeightClass)} aria-label="Options">
    {#if items.length === 0}
      <li
        class="grid place-items-center rounded-md border bg-card p-4 text-center text-sm text-muted-foreground italic"
      >
        {emptyText}
      </li>
    {:else if filtered.length === 0}
      <li
        class="grid place-items-center rounded-md border bg-card p-4 text-center text-sm text-muted-foreground italic"
      >
        {noMatchesText}
      </li>
    {:else}
      {#each filtered as item (item.id)}
        {@const selected = isSelected(item.id)}
        {@const excluded = isExcluded(item.id)}
        {@const avatarSrc = (item.avatar ?? "").trim()}
        {@const rowDisabled = locked || excluded}
        <li>
          <div
            class={cn(
              "group flex items-start justify-between gap-3 rounded-md border bg-card px-3 py-2 text-left transition-colors",
              "hover:border-ring hover:bg-card",
              (selected || excluded) && "border-primary bg-primary/10",
              rowDisabled && "cursor-not-allowed opacity-60",
            )}
            role="button"
            tabindex={rowDisabled ? undefined : 0}
            aria-disabled={rowDisabled}
            aria-pressed={selected}
            onclick={() => toggle(item.id)}
            onkeydown={(e) => {
              if (rowDisabled) return
              if (e.key !== "Enter" && e.key !== " ") return
              e.preventDefault()
              toggle(item.id)
            }}
          >
            <div class="flex min-w-0 items-start gap-3">
              {#if avatarSrc}
                <Avatar.Root class="mt-0.5 size-9 border bg-muted shadow-sm">
                  <Avatar.Image src={avatarSrc} alt={`${item.name} avatar`} class="object-cover" />
                </Avatar.Root>
              {/if}
              <div class="min-w-0">
                <div class="flex min-w-0 items-center gap-2">
                  <div class="truncate text-sm font-medium text-foreground">{item.name}</div>
                  {#if item.tag}
                    <Badge variant="outline" class="shrink-0 font-mono text-[11px]">{item.tag}</Badge>
                  {/if}
                  {#if excluded}
                    <Badge variant="outline" class="shrink-0 font-mono text-[11px]" title="Excluded">
                      {excludeBadgeLabel}
                    </Badge>
                  {/if}
                </div>
                {#if item.description}
                  <div class="mt-0.5 truncate text-xs text-muted-foreground">{item.description}</div>
                {/if}
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              {#if onDetails && item.details}
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-9 w-9"
                  title={item.detailsTitle ?? "Details"}
                  aria-label={item.detailsAriaLabel ?? `Details for ${item.name}`}
                  disabled={locked}
                  onclick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onDetails(item)
                  }}
                >
                  <FileText size={16} strokeWidth={1.6} aria-hidden="true" />
                </Button>
              {/if}

              <Badge variant={selected || excluded ? "secondary" : "outline"} class="shrink-0 font-mono text-[11px]">
                {excluded ? excludeBadgeLabel : selected ? "Selected" : "Add"}
              </Badge>
            </div>
          </div>
        </li>
      {/each}
    {/if}
  </ul>
</div>
