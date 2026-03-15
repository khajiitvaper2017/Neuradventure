<script lang="ts">
  import { isChatGenerating } from "@/stores/chat"
  import { isGenerating } from "@/stores/game"
  import {
    authorNoteEnabled,
    defaultAuthorNote,
    defaultAuthorNoteDepth,
    defaultAuthorNoteEmbedState,
    defaultAuthorNoteInterval,
    defaultAuthorNotePosition,
    defaultAuthorNoteRole,
  } from "@/stores/settings"

  let generationLockActive = $state(false)
  $effect(() => {
    generationLockActive = $isGenerating || $isChatGenerating
  })

  let authorNoteDraft = $state($defaultAuthorNote)
  let authorNoteDepthDraft = $state($defaultAuthorNoteDepth)
  let authorNotePositionDraft = $state($defaultAuthorNotePosition)
  let authorNoteIntervalDraft = $state($defaultAuthorNoteInterval)
  let authorNoteRoleDraft = $state($defaultAuthorNoteRole)
  let authorNoteEmbedStateDraft = $state($defaultAuthorNoteEmbedState)

  $effect(() => {
    authorNoteDraft = $defaultAuthorNote
  })
  $effect(() => {
    authorNoteDepthDraft = $defaultAuthorNoteDepth
  })
  $effect(() => {
    authorNotePositionDraft = $defaultAuthorNotePosition
  })
  $effect(() => {
    authorNoteIntervalDraft = $defaultAuthorNoteInterval
  })
  $effect(() => {
    authorNoteRoleDraft = $defaultAuthorNoteRole
  })
  $effect(() => {
    authorNoteEmbedStateDraft = $defaultAuthorNoteEmbedState
  })

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

<div class="control-section-label">Story Defaults</div>

<label class="control-row" class:control-row--disabled={generationLockActive}>
  <span class="control-row-text">
    <span class="control-row-title">Enable Author Note in prompts</span>
    <span class="control-row-sub">When disabled, author notes are not sent to the model (saved notes remain)</span>
  </span>
  <input type="checkbox" bind:checked={$authorNoteEnabled} disabled={generationLockActive} />
</label>

<label class="control-row control-row--input control-row--stack">
  <span class="control-row-text">
    <span class="control-row-title">Default Author Note</span>
    <span class="control-row-sub">Applied to newly created stories</span>
  </span>
  <textarea class="text-input" rows="3" bind:value={authorNoteDraft} onblur={commitAuthorNote}></textarea>
</label>

<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Author Note Depth</span>
    <span class="control-row-sub">How many recent turns from the bottom to inject</span>
  </span>
  <input
    class="num-input"
    type="number"
    min="0"
    max="100"
    step="1"
    bind:value={authorNoteDepthDraft}
    onblur={commitAuthorNote}
  />
</label>

<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Author Note Position</span>
    <span class="control-row-sub">Before scenario, in-chat, or after scenario</span>
  </span>
  <select class="text-input" bind:value={authorNotePositionDraft} onchange={commitAuthorNote} onblur={commitAuthorNote}>
    <option value={2}>Before scenario</option>
    <option value={1}>In chat</option>
    <option value={0}>After scenario</option>
  </select>
</label>

<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Author Note Interval</span>
    <span class="control-row-sub">Inject note text every Nth user message (0 disables)</span>
  </span>
  <input
    class="num-input"
    type="number"
    min="0"
    max="1000"
    step="1"
    bind:value={authorNoteIntervalDraft}
    onblur={commitAuthorNote}
  />
</label>

<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Author Note Role</span>
    <span class="control-row-sub">Role hint (for display/markup only)</span>
  </span>
  <select class="text-input" bind:value={authorNoteRoleDraft} onchange={commitAuthorNote} onblur={commitAuthorNote}>
    <option value={0}>System</option>
    <option value={1}>User</option>
    <option value={2}>Assistant</option>
  </select>
</label>

<label class="control-row" class:control-row--disabled={generationLockActive}>
  <span class="control-row-text">
    <span class="control-row-title">Default: Embed state blocks in Author Note</span>
    <span class="control-row-sub">If enabled, volatile state sections are wrapped into the author note</span>
  </span>
  <input
    type="checkbox"
    bind:checked={authorNoteEmbedStateDraft}
    disabled={generationLockActive}
    onchange={commitAuthorNote}
  />
</label>
