<script lang="ts">
  import { isChatGenerating } from "@/stores/chat"
  import { isGenerating } from "@/stores/game"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import * as InputGroup from "@/components/ui/input-group"
  import { Label } from "@/components/ui/label"
  import * as Select from "@/components/ui/select"
  import { Switch } from "@/components/ui/switch"
  import { Book } from "@lucide/svelte"
  import {
    authorNoteEnabled,
    defaultAuthorNote,
    defaultAuthorNoteDepth,
    defaultAuthorNoteEmbedState,
    defaultAuthorNoteInterval,
    defaultAuthorNotePosition,
    defaultAuthorNoteRole,
  } from "@/stores/settings"

  let generationLockActive = $derived($isGenerating || $isChatGenerating)

  let authorNoteDraft = $derived($defaultAuthorNote)
  let authorNoteDepthDraft = $derived($defaultAuthorNoteDepth)
  let authorNotePositionDraft = $derived($defaultAuthorNotePosition)
  let authorNoteIntervalDraft = $derived($defaultAuthorNoteInterval)
  let authorNoteRoleDraft = $derived($defaultAuthorNoteRole)
  let authorNoteEmbedStateDraft = $derived($defaultAuthorNoteEmbedState)

  const AUTHOR_NOTE_POSITION_OPTIONS = [
    { value: "2", label: "Before scenario" },
    { value: "1", label: "In chat" },
    { value: "0", label: "After scenario" },
  ]
  const AUTHOR_NOTE_ROLE_OPTIONS = [
    { value: "0", label: "System" },
    { value: "1", label: "User" },
    { value: "2", label: "Assistant" },
  ]
  let authorNotePositionLabel = $derived(
    AUTHOR_NOTE_POSITION_OPTIONS.find((o) => o.value === String(authorNotePositionDraft))?.label ?? "Select…",
  )
  let authorNoteRoleLabel = $derived(
    AUTHOR_NOTE_ROLE_OPTIONS.find((o) => o.value === String(authorNoteRoleDraft))?.label ?? "Select…",
  )

  function commitAuthorNote() {
    const trimmedNote = authorNoteDraft.trim()
    const nextDepthRaw = Number(authorNoteDepthDraft)
    const nextDepth = Number.isFinite(nextDepthRaw) ? Math.min(100, Math.max(0, Math.floor(nextDepthRaw))) : 4
    const nextPositionRaw = Number(authorNotePositionDraft)
    const nextPosition = Number.isFinite(nextPositionRaw) ? Math.min(2, Math.max(0, Math.floor(nextPositionRaw))) : 1
    const nextIntervalRaw = Number(authorNoteIntervalDraft)
    const nextInterval = Number.isFinite(nextIntervalRaw) ? Math.min(1000, Math.max(0, Math.floor(nextIntervalRaw))) : 1
    const nextRoleRaw = Number(authorNoteRoleDraft)
    const nextRole = Number.isFinite(nextRoleRaw) ? Math.min(2, Math.max(0, Math.floor(nextRoleRaw))) : 0

    if (trimmedNote !== $defaultAuthorNote) defaultAuthorNote.set(trimmedNote)
    if (nextDepth !== $defaultAuthorNoteDepth) defaultAuthorNoteDepth.set(nextDepth)
    if (nextPosition !== $defaultAuthorNotePosition) defaultAuthorNotePosition.set(nextPosition)
    if (nextInterval !== $defaultAuthorNoteInterval) defaultAuthorNoteInterval.set(nextInterval)
    if (nextRole !== $defaultAuthorNoteRole) defaultAuthorNoteRole.set(nextRole)
    if (authorNoteEmbedStateDraft !== $defaultAuthorNoteEmbedState)
      defaultAuthorNoteEmbedState.set(authorNoteEmbedStateDraft)
  }
</script>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <Book class="size-4 text-muted-foreground" aria-hidden="true" />
      Story Defaults
    </CardTitle>
    <CardDescription>Defaults applied when creating new stories.</CardDescription>
  </CardHeader>

  <CardContent class="pb-6">
    <div
      class="divide-y divide-border overflow-hidden rounded-md border bg-card/50"
      class:opacity-60={generationLockActive}
    >
      <div class="flex items-start justify-between gap-4 p-4" aria-disabled={generationLockActive}>
        <div class="min-w-0 flex-1 space-y-1">
          <div class="text-sm font-medium text-foreground">Enable Author Note in prompts</div>
          <div class="text-xs text-muted-foreground">
            When disabled, author notes are not sent to the model (saved notes remain).
          </div>
        </div>
        <Switch
          checked={$authorNoteEnabled}
          disabled={generationLockActive}
          onCheckedChange={(v) => authorNoteEnabled.set(v)}
        />
      </div>

      <div class="space-y-3 p-4">
        <div class="space-y-1">
          <div class="text-sm font-medium text-foreground">Default Author Note</div>
          <div class="text-xs text-muted-foreground">Applied to newly created stories.</div>
        </div>
        <div class="grid gap-2">
          <Label for="default-author-note" class="sr-only">Default Author Note</Label>
          <InputGroup.Root data-disabled={generationLockActive ? "true" : undefined} class="min-h-[96px]">
            <InputGroup.Textarea
              id="default-author-note"
              rows={3}
              bind:value={authorNoteDraft}
              placeholder="Optional note injected into prompts…"
              onblur={commitAuthorNote}
              class="min-h-[96px]"
              disabled={generationLockActive}
            />
          </InputGroup.Root>
        </div>
      </div>

      <div class="flex items-start justify-between gap-4 p-4">
        <div class="min-w-0 flex-1 space-y-1">
          <div class="text-sm font-medium text-foreground">Author Note Depth</div>
          <div class="text-xs text-muted-foreground">How many recent turns from the bottom to inject.</div>
        </div>
        <div class="w-32">
          <Label for="author-note-depth" class="sr-only">Author Note Depth</Label>
          <InputGroup.Root data-disabled={generationLockActive ? "true" : undefined}>
            <InputGroup.Input
              id="author-note-depth"
              type="number"
              min="0"
              max="100"
              step="1"
              bind:value={authorNoteDepthDraft}
              onblur={commitAuthorNote}
              disabled={generationLockActive}
            />
          </InputGroup.Root>
        </div>
      </div>

      <div class="flex items-start justify-between gap-4 p-4">
        <div class="min-w-0 flex-1 space-y-1">
          <div class="text-sm font-medium text-foreground">Author Note Position</div>
          <div class="text-xs text-muted-foreground">Before scenario, in-chat, or after scenario.</div>
        </div>
        <div class="w-44">
          <Label class="sr-only" for="author-note-position">Author Note Position</Label>
          <Select.Root
            type="single"
            value={String(authorNotePositionDraft)}
            items={AUTHOR_NOTE_POSITION_OPTIONS}
            disabled={generationLockActive}
            onValueChange={(next) => {
              authorNotePositionDraft = Number(next)
              commitAuthorNote()
            }}
          >
            <Select.Trigger id="author-note-position" class="w-full" aria-label="Author Note Position">
              {authorNotePositionLabel}
            </Select.Trigger>
            <Select.Content>
              {#each AUTHOR_NOTE_POSITION_OPTIONS as option (option.value)}
                <Select.Item {...option} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      <div class="flex items-start justify-between gap-4 p-4">
        <div class="min-w-0 flex-1 space-y-1">
          <div class="text-sm font-medium text-foreground">Author Note Interval</div>
          <div class="text-xs text-muted-foreground">Inject note text every Nth user message (0 disables).</div>
        </div>
        <div class="w-32">
          <Label for="author-note-interval" class="sr-only">Author Note Interval</Label>
          <InputGroup.Root data-disabled={generationLockActive ? "true" : undefined}>
            <InputGroup.Input
              id="author-note-interval"
              type="number"
              min="0"
              max="1000"
              step="1"
              bind:value={authorNoteIntervalDraft}
              onblur={commitAuthorNote}
              disabled={generationLockActive}
            />
          </InputGroup.Root>
        </div>
      </div>

      <div class="flex items-start justify-between gap-4 p-4">
        <div class="min-w-0 flex-1 space-y-1">
          <div class="text-sm font-medium text-foreground">Author Note Role</div>
          <div class="text-xs text-muted-foreground">Role hint (for display/markup only).</div>
        </div>
        <div class="w-44">
          <Label class="sr-only" for="author-note-role">Author Note Role</Label>
          <Select.Root
            type="single"
            value={String(authorNoteRoleDraft)}
            items={AUTHOR_NOTE_ROLE_OPTIONS}
            disabled={generationLockActive}
            onValueChange={(next) => {
              authorNoteRoleDraft = Number(next)
              commitAuthorNote()
            }}
          >
            <Select.Trigger id="author-note-role" class="w-full" aria-label="Author Note Role">
              {authorNoteRoleLabel}
            </Select.Trigger>
            <Select.Content>
              {#each AUTHOR_NOTE_ROLE_OPTIONS as option (option.value)}
                <Select.Item {...option} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      <div class="flex items-start justify-between gap-4 p-4" aria-disabled={generationLockActive}>
        <div class="min-w-0 flex-1 space-y-1">
          <div class="text-sm font-medium text-foreground">Default: Embed state blocks in Author Note</div>
          <div class="text-xs text-muted-foreground">
            If enabled, volatile state sections are wrapped into the author note.
          </div>
        </div>
        <Switch
          checked={authorNoteEmbedStateDraft}
          disabled={generationLockActive}
          onCheckedChange={(v) => {
            authorNoteEmbedStateDraft = v
            commitAuthorNote()
          }}
        />
      </div>
    </div>
  </CardContent>
</Card>
