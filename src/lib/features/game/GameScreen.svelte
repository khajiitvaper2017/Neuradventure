<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from "svelte"
  import { AppError } from "@/errors"
  import type { StoryModules, TurnSummary } from "@/shared/types"
  import {
    INTERNAL_UI_FLASH_MS,
    INTERNAL_UI_KEYBOARD_SCROLL_DELAY_MS,
    INTERNAL_UI_RESUME_PENDING_TURN_DELAY_MS,
  } from "@/shared/internal-timeouts"
  import { DEFAULT_STORY_MODULES } from "@/engine/schemas/story-modules"
  import { stories } from "@/services/stories"
  import { settings as settingsService } from "@/services/settings"
  import { turns as turnsService } from "@/services/turns"
  import { subscribeStreamPreview } from "@/services/streamPreview"
  import { navigate } from "@/stores/router"
  import { showError, showConfirm, showQuietNotice } from "@/stores/ui"
  import { createRequestId } from "@/utils/ids"
  import { normalizePlayerInput } from "@/utils/inputNormalize"
  import { scheduleKeyboardScroll as scheduleKeyboardScrollUtil } from "@/utils/keyboardScroll"
  import { scrollToBottom } from "@/utils/scroll"
  import { isNearBottom } from "@/utils/scrollFollow"
  import { createModal } from "@/utils/modalState.svelte.ts"
  import AuthorsNoteModal from "@/components/overlays/AuthorsNoteModal.svelte"
  import { streamingEnabled } from "@/stores/settings"
  import {
    currentStoryId,
    currentStoryOpeningScenario,
    currentStoryAuthorNote,
    currentStoryAuthorNoteDepth,
    currentStoryAuthorNotePosition,
    currentStoryAuthorNoteInterval,
    currentStoryAuthorNoteRole,
    currentStoryAuthorNoteEmbedState,
    currentStoryModules,
    worldState,
    turns,
    isGenerating,
  } from "@/stores/game"
  import { clearPendingTurn, getPendingTurn, setPendingTurn, type PendingTurn } from "@/features/game/pendingTurn"
  import { createStreamController } from "@/features/game/streamController.svelte.ts"
  import { createTurnVariantsState } from "@/features/game/variantsState.svelte.ts"
  import { createWorldFieldsModal } from "@/features/game/worldFieldsModalState.svelte.ts"
  import {
    cancelLastTurn as cancelLastTurnAction,
    regenerateLastTurn as regenerateLastTurnAction,
    resumePendingTurn as resumePendingTurnAction,
    selectVariant as selectVariantAction,
    takeTurn,
    undoCancelLastTurn as undoCancelLastTurnAction,
    type ActionMode,
  } from "@/features/game/turnActions"
  import GameTopBar from "@/features/game/GameTopBar.svelte"
  import GameStoryArea from "@/features/game/GameStoryArea.svelte"
  import GameInputZone from "@/features/game/GameInputZone.svelte"
  import MemoryModal from "@/features/game/MemoryModal.svelte"
  import StoryModulesModal from "@/features/game/StoryModulesModal.svelte"
  import WorldFieldsModal from "@/features/game/WorldFieldsModal.svelte"

  function handleError(err: unknown, fallback: string) {
    showError(err instanceof AppError ? err.message : fallback)
  }

  function createTimer() {
    return { id: null as number | null }
  }

  function clearTimer(timer: { id: number | null }) {
    if (timer.id) window.clearTimeout(timer.id)
    timer.id = null
  }

  let input = $state("")
  let actionMode = $state<ActionMode>("do")
  let storyDiv = $state<HTMLDivElement | null>(null)
  let inputEl = $state<HTMLTextAreaElement | null>(null)
  let editingOpening = $state(false)
  let openingDraft = $state("")
  let editingTurnId = $state<number | null>(null)
  let editPlayerInput = $state("")
  let editNarrative = $state("")
  const variantsState = createTurnVariantsState()
  let canUndoCancel = $state(false)
  const memoryModal = createModal(() => "")
  const worldFieldsModal = createWorldFieldsModal()
  const authorNoteModal = createModal(() => ({
    note: "",
    depth: 4,
    position: 1,
    interval: 1,
    role: 0,
    embedState: false,
  }))
  const modulesModal = createModal<StoryModules>(() => ({ ...DEFAULT_STORY_MODULES }))
  let flashScene = $state(false)
  let flashOpening = $state(false)
  let isImpersonating = $state(false)
  const sceneFlashTimer = createTimer()
  const openingFlashTimer = createTimer()
  const keyboardScrollTimer = createTimer()
  let lastViewportHeight = 0
  let regeneratingTurnId = $state<number | null>(null)

  let initialScrollDone = $state(false)
  let userActed = $state(false)
  const resumedRequestIds = new Set<string>()

  let sceneText = $derived($worldState ? `${$worldState.current_scene} · ${$worldState.time_of_day}` : "")
  let openingText = $derived($currentStoryOpeningScenario || $worldState?.memory || "")

  const stream = createStreamController({
    enabled: () => $streamingEnabled,
    subscribe: subscribeStreamPreview,
    applyPatch: (state, patch) => {
      if (!patch || typeof patch !== "object") return
      const p = patch as Record<string, unknown>
      if (typeof p.narrative_text === "string") state.narrative = p.narrative_text
      if (typeof p.background_events === "string") state.background = p.background_events
      if (typeof p.current_scene === "string") state.scene = p.current_scene
      if (typeof p.time_of_day === "string") state.time = p.time_of_day
    },
    isNearBottom: () => (storyDiv ? isNearBottom(storyDiv) : true),
    scrollToBottom: (opts) => scrollStoryToBottom(opts),
    tick,
  })

  function scrollStoryToBottom(opts?: Parameters<typeof scrollToBottom>[1]) {
    if (!storyDiv) return
    scrollToBottom(storyDiv, opts)
  }

  function lastTurnId(): number | null {
    return $turns.length > 0 ? $turns[$turns.length - 1].id : null
  }

  function handleStoryScroll() {
    if (!$isGenerating || !$streamingEnabled) return
    stream.handleScroll()
  }

  function jumpToLatest() {
    stream.jumpToLatest()
  }

  function triggerFlash(setter: (v: boolean) => void, ref: { id: number | null }) {
    setter(true)
    if (ref.id) window.clearTimeout(ref.id)
    ref.id = window.setTimeout(() => setter(false), INTERNAL_UI_FLASH_MS)
  }

  type WorldSnapshot = {
    hasBaseline: boolean
    sceneText: string
    openingText: string
  }

  function snapshotWorld(): WorldSnapshot {
    return {
      hasBaseline: Boolean($worldState || $currentStoryOpeningScenario),
      sceneText,
      openingText,
    }
  }

  function flashWorldDiff(prev: WorldSnapshot) {
    if (!prev.hasBaseline) return
    if (sceneText && sceneText !== prev.sceneText) triggerFlash((v) => (flashScene = v), sceneFlashTimer)
    if (openingText && openingText !== prev.openingText) triggerFlash((v) => (flashOpening = v), openingFlashTimer)
  }

  async function withGeneration<T>(fn: () => Promise<T>): Promise<T> {
    isGenerating.set(true)
    try {
      return await fn()
    } finally {
      isGenerating.set(false)
    }
  }

  async function withGenerationAndStream<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
    isGenerating.set(true)
    stream.start(requestId)
    try {
      return await fn()
    } finally {
      isGenerating.set(false)
      stream.stop()
    }
  }

  async function withStreamSetupGeneration<T>(requestId: string, setup: () => void, fn: () => Promise<T>): Promise<T> {
    stream.start(requestId)
    try {
      setup()
      return await withGeneration(fn)
    } finally {
      stream.stop()
    }
  }

  async function finishTurn(
    turnId: number,
    prevWorld: WorldSnapshot,
    opts?: { afterFlash?: () => void; afterLoad?: () => void },
  ) {
    flashWorldDiff(prevWorld)
    opts?.afterFlash?.()
    await variantsState.load(turnId, true)
    opts?.afterLoad?.()
    await tick()
    scrollStoryToBottom({ smooth: true })
  }

  async function sendTurn() {
    const rawText = input.trim()
    const isEmpty = rawText.length === 0
    const sendMode = isEmpty ? "story" : actionMode
    const text = isEmpty ? "" : normalizePlayerInput(rawText, actionMode)
    if ((!isEmpty && !text) || $isGenerating || !$currentStoryId) return
    const requestId = createRequestId()
    const prevWorld = snapshotWorld()
    try {
      await withStreamSetupGeneration(
        requestId,
        () => {
          setPendingTurn({
            storyId: $currentStoryId,
            actionMode: sendMode,
            playerInput: text,
            requestId,
            lastTurnId: lastTurnId(),
            createdAt: Date.now(),
          })
          input = ""
          userActed = true
        },
        async () => {
          const res = await takeTurn({ storyId: $currentStoryId, playerInput: text, actionMode: sendMode, requestId })
          await finishTurn(res.turnId, prevWorld, { afterFlash: () => (canUndoCancel = false) })
          clearPendingTurn()
        },
      )
    } catch (err) {
      handleError(err, "Generation failed. Is KoboldCpp running?")
    }
  }

  async function impersonatePlayer() {
    if ($isGenerating || isImpersonating || !$currentStoryId) return
    isImpersonating = true
    try {
      const result = await turnsService.impersonate($currentStoryId, actionMode)
      const action = result.player_action?.trim()
      if (!action) {
        showQuietNotice("Impersonate returned an empty action.")
        return
      }
      input = action
      await tick()
    } catch (err) {
      handleError(err, "Impersonate failed. Is KoboldCpp running?")
    } finally {
      isImpersonating = false
    }
  }

  async function resumePendingTurn(pending: PendingTurn) {
    if ($isGenerating) return
    if (!$currentStoryId || pending.storyId !== $currentStoryId) return
    if (lastTurnId() !== pending.lastTurnId) {
      clearPendingTurn()
      return
    }
    const prevWorld = snapshotWorld()
    try {
      await withGenerationAndStream(pending.requestId, async () => {
        const res = await resumePendingTurnAction({
          storyId: $currentStoryId,
          playerInput: pending.playerInput,
          actionMode: pending.actionMode,
          requestId: pending.requestId,
        })
        await finishTurn(res.turnId, prevWorld, { afterFlash: () => clearPendingTurn() })
      })
    } catch (err) {
      handleError(err, "Failed to resume generation")
    }
  }

  $effect(() => {
    if (typeof window === "undefined") return
    if (!$currentStoryId) return
    const pending = getPendingTurn()
    if (!pending) return
    if (pending.storyId !== $currentStoryId) return
    if (resumedRequestIds.has(pending.requestId)) return
    if (lastTurnId() !== pending.lastTurnId) {
      clearPendingTurn()
      return
    }
    resumedRequestIds.add(pending.requestId)
    window.setTimeout(() => {
      void resumePendingTurn(pending)
    }, INTERNAL_UI_RESUME_PENDING_TURN_DELAY_MS)
  })

  async function regenerateLastTurn() {
    if ($isGenerating || !$currentStoryId || $turns.length === 0) return
    userActed = true
    const requestId = createRequestId()
    regeneratingTurnId = $turns[$turns.length - 1]?.id ?? null
    const prevWorld = snapshotWorld()
    try {
      await withGenerationAndStream(requestId, async () => {
        const lastMode = $turns[$turns.length - 1]?.action_mode ?? actionMode
        const res = await regenerateLastTurnAction({ storyId: $currentStoryId, mode: lastMode, requestId })
        await finishTurn(res.turnId, prevWorld, { afterLoad: () => (editingTurnId = null) })
      })
    } catch (err) {
      handleError(err, "Generation failed. Is KoboldCpp running?")
    } finally {
      regeneratingTurnId = null
    }
  }

  async function cancelLastTurn() {
    if ($isGenerating || !$currentStoryId || $turns.length === 0) return
    const canceledTurn = $turns[$turns.length - 1]
    const canceledInput = canceledTurn?.player_input?.trim() ?? ""
    const canceledMode = canceledTurn?.action_mode ?? actionMode
    userActed = true
    try {
      await withGeneration(async () => {
        const res = await cancelLastTurnAction($currentStoryId)
        canUndoCancel = true
        if (res.nextLastId) {
          await variantsState.load(res.nextLastId, true)
        } else {
          variantsState.clear()
        }
        editingTurnId = null
        if (canceledInput) {
          input = canceledInput
          actionMode = canceledMode
        }
        await tick()
        scrollStoryToBottom({ smooth: true })
        inputEl?.focus()
      })
    } catch (err) {
      handleError(err, "Failed to cancel last turn")
    }
  }

  async function undoCancelLastTurn() {
    if ($isGenerating || !$currentStoryId) return
    userActed = true
    const prevWorld = snapshotWorld()
    try {
      await withGeneration(async () => {
        const res = await undoCancelLastTurnAction($currentStoryId)
        await finishTurn(res.turnId, prevWorld, { afterFlash: () => (canUndoCancel = false) })
      })
    } catch (err) {
      handleError(err, "Failed to undo cancel")
    }
  }

  function startEditOpening() {
    openingDraft = $currentStoryOpeningScenario || $worldState?.memory || ""
    editingOpening = true
  }

  function cancelEditOpening() {
    editingOpening = false
  }

  async function saveOpening() {
    if (!$currentStoryId) return
    const text = openingDraft.trim()
    if (!text) {
      showError("Opening scenario cannot be empty")
      return
    }
    try {
      await stories.update($currentStoryId, { opening_scenario: text })
      currentStoryOpeningScenario.set(text)
      editingOpening = false
    } catch {
      showError("Failed to update opening scenario")
    }
  }

  function openMemoryEditor() {
    memoryModal.show($worldState?.memory ?? "")
  }

  async function saveMemory() {
    if (!$currentStoryId) return
    const text = memoryModal.draft.trim()
    if (!text) {
      showError("Memory cannot be empty")
      return
    }
    try {
      const result = await stories.updateState($currentStoryId, { world: { memory: text } })
      worldState.set(result.world)
      memoryModal.close()
    } catch {
      showError("Failed to update memory")
    }
  }

  async function openWorldFieldsEditor() {
    worldFieldsModal.show({ ...($worldState?.custom_fields ?? {}) })
    try {
      worldFieldsModal.defs = await settingsService.customFields()
    } catch {
      showError("Failed to load custom fields")
    }
  }

  async function saveWorldFields() {
    if (!$currentStoryId) return
    try {
      worldFieldsModal.saving = true
      const result = await stories.updateState($currentStoryId, { world: { custom_fields: worldFieldsModal.draft } })
      worldState.set(result.world)
      worldFieldsModal.close()
    } catch {
      showError("Failed to update world fields")
    } finally {
      worldFieldsModal.saving = false
    }
  }

  function openAuthorNoteEditor() {
    authorNoteModal.show({
      note: $currentStoryAuthorNote,
      depth: $currentStoryAuthorNoteDepth,
      position: $currentStoryAuthorNotePosition,
      interval: $currentStoryAuthorNoteInterval,
      role: $currentStoryAuthorNoteRole,
      embedState: $currentStoryAuthorNoteEmbedState,
    })
  }

  async function saveAuthorNote() {
    if (!$currentStoryId) return
    try {
      const draft = authorNoteModal.draft
      const nextDepth = Math.max(0, Math.min(100, Math.floor(Number(draft.depth) || 0)))
      const nextPosition = Math.max(0, Math.min(2, Math.floor(Number(draft.position) || 0)))
      const nextInterval = Math.max(0, Math.min(1000, Math.floor(Number(draft.interval) || 0)))
      const nextRole = Math.max(0, Math.min(2, Math.floor(Number(draft.role) || 0)))
      await stories.update($currentStoryId, {
        author_note: draft.note,
        author_note_depth: nextDepth,
        author_note_position: nextPosition,
        author_note_interval: nextInterval,
        author_note_role: nextRole,
        author_note_embed_state: draft.embedState,
      })
      currentStoryAuthorNote.set(draft.note)
      currentStoryAuthorNoteDepth.set(nextDepth)
      currentStoryAuthorNotePosition.set(nextPosition)
      currentStoryAuthorNoteInterval.set(nextInterval)
      currentStoryAuthorNoteRole.set(nextRole)
      currentStoryAuthorNoteEmbedState.set(draft.embedState)
      authorNoteModal.close()
    } catch {
      showError("Failed to update author's note")
    }
  }

  function openModulesEditor() {
    modulesModal.show($currentStoryModules ?? { ...DEFAULT_STORY_MODULES })
  }

  async function saveModules() {
    if (!$currentStoryId) return
    try {
      await stories.update($currentStoryId, { story_modules: modulesModal.draft })
      currentStoryModules.set(modulesModal.draft)
      modulesModal.close()
    } catch {
      showError("Failed to update story modules")
    }
  }

  function startEditTurn(turn: TurnSummary) {
    editingTurnId = turn.id
    editPlayerInput = turn.player_input
    editNarrative = turn.narrative_text
    // autoresize uses rAF internally, so wait for tick + 2 rAFs to ensure textareas are sized
    tick().then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => requestAnimationFrame(() => scrollStoryToBottom({ smooth: true }))),
      ),
    )
  }

  function cancelEditTurn() {
    editingTurnId = null
  }

  async function saveTurnEdit(turnId: number) {
    const turnMode = $turns.find((turn) => turn.id === turnId)?.action_mode
    const narrative = editNarrative.trim()
    const playerInputRaw = editPlayerInput.trim()
    const playerInput = playerInputRaw ? normalizePlayerInput(playerInputRaw, turnMode) : ""
    if (!narrative) {
      showError("Narrative text is required")
      return
    }
    try {
      await turnsService.update(turnId, { player_input: playerInput, narrative_text: narrative })
      turns.update((t) =>
        t.map((turn) =>
          turn.id === turnId ? { ...turn, player_input: playerInput, narrative_text: narrative } : turn,
        ),
      )
      editingTurnId = null
    } catch {
      showError("Failed to update turn")
    }
  }

  async function deleteTurn(turnId: number) {
    if ($isGenerating) return
    const confirmed = await showConfirm({
      title: "Delete turn",
      message: "Delete this turn? This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    })
    if (!confirmed) return
    try {
      await turnsService.delete(turnId)
      turns.update((t) => t.filter((turn) => turn.id !== turnId))
      const remaining = $turns
      if (remaining.length > 0) {
        await variantsState.load(remaining[remaining.length - 1].id, true)
      } else {
        variantsState.clear()
      }
    } catch {
      showError("Failed to delete turn")
    }
  }

  function scheduleKeyboardScroll() {
    scheduleKeyboardScrollUtil(keyboardScrollTimer, () => scrollStoryToBottom(), INTERNAL_UI_KEYBOARD_SCROLL_DELAY_MS)
  }

  function goHome() {
    navigate("home", { reset: true })
  }

  async function selectVariant(variantId: number) {
    if ($isGenerating || !$currentStoryId || !variantsState.turnId) return
    userActed = true
    const prevWorld = snapshotWorld()
    const turnId = variantsState.turnId
    try {
      await withGeneration(async () => {
        const res = await selectVariantAction({ turnId, variantId })
        flashWorldDiff(prevWorld)
        variantsState.activeVariantId = res.activeVariantId
        await tick()
        scrollStoryToBottom({ smooth: true })
      })
    } catch (err) {
      handleError(err, "Failed to switch version")
    }
  }

  $effect(() => {
    const len = $turns.length
    if (len > 0) {
      const lastId = $turns[len - 1].id
      untrack(() => {
        if (variantsState.turnId !== lastId) {
          variantsState.load(lastId).then(() => {
            if (!initialScrollDone) {
              initialScrollDone = true
              tick().then(() => requestAnimationFrame(() => scrollStoryToBottom()))
            }
          })
        }
      })
    } else {
      untrack(() => {
        if (variantsState.turnId !== null) {
          variantsState.clear()
        }
      })
    }
  })

  $effect(() => {
    const storyId = $currentStoryId
    untrack(() => {
      if (!storyId) {
        flashScene = false
        flashOpening = false
        canUndoCancel = false
        clearTimer(sceneFlashTimer)
        clearTimer(openingFlashTimer)
      }
    })
  })

  onMount(() => {
    if (typeof window === "undefined") return
    const viewport = window.visualViewport
    lastViewportHeight = viewport?.height ?? 0
    if (!viewport) return

    const handleViewportResize = () => {
      if (!inputEl || document.activeElement !== inputEl) return
      const next = viewport.height
      if (next && next !== lastViewportHeight) {
        lastViewportHeight = next
        scheduleKeyboardScroll()
      }
    }

    viewport.addEventListener("resize", handleViewportResize)
    return () => {
      viewport.removeEventListener("resize", handleViewportResize)
      clearTimer(keyboardScrollTimer)
    }
  })

  onDestroy(() => {
    ;[sceneFlashTimer, openingFlashTimer, keyboardScrollTimer].forEach(clearTimer)
    stream.stop()
  })
</script>

<div class="relative mx-auto flex h-dvh w-full max-w-3xl flex-col overflow-hidden">
  <GameTopBar
    {flashScene}
    onGoHome={goHome}
    onOpenMemoryEditor={openMemoryEditor}
    onOpenWorldFieldsEditor={() => void openWorldFieldsEditor()}
    onOpenAuthorNoteEditor={openAuthorNoteEditor}
    onOpenModulesEditor={openModulesEditor}
  />

  <MemoryModal
    open={memoryModal.open}
    disabled={$isGenerating}
    bind:draft={memoryModal.draft}
    onCancel={() => memoryModal.close()}
    onSave={saveMemory}
  />

  <WorldFieldsModal
    open={worldFieldsModal.open}
    disabled={$isGenerating || worldFieldsModal.saving}
    defs={worldFieldsModal.defs}
    values={worldFieldsModal.draft}
    setValues={(next) => (worldFieldsModal.draft = next)}
    onCancel={() => worldFieldsModal.close()}
    onSave={() => void saveWorldFields()}
  />

  <!-- ── Author's Note editor overlay ──────────────────── -->
  <AuthorsNoteModal
    open={authorNoteModal.open}
    disabled={$isGenerating}
    bind:note={authorNoteModal.draft.note}
    bind:position={authorNoteModal.draft.position}
    bind:depth={authorNoteModal.draft.depth}
    bind:interval={authorNoteModal.draft.interval}
    bind:role={authorNoteModal.draft.role}
    bind:embedState={authorNoteModal.draft.embedState}
    onCancel={() => authorNoteModal.close()}
    onSave={saveAuthorNote}
  />

  <StoryModulesModal
    open={modulesModal.open}
    disabled={$isGenerating}
    bind:modules={modulesModal.draft}
    onCancel={() => modulesModal.close()}
    onSave={saveModules}
  />

  <GameStoryArea
    bind:storyDiv
    {initialScrollDone}
    {flashScene}
    {flashOpening}
    {editingOpening}
    bind:openingDraft
    {startEditOpening}
    {cancelEditOpening}
    {saveOpening}
    {editingTurnId}
    bind:editPlayerInput
    bind:editNarrative
    {startEditTurn}
    {cancelEditTurn}
    {saveTurnEdit}
    {deleteTurn}
    {userActed}
    {regeneratingTurnId}
    lastTurnVariants={variantsState.variants}
    activeVariantId={variantsState.activeVariantId}
    {selectVariant}
    {handleStoryScroll}
    streamNarrative={stream.state.narrative}
    streamBackground={stream.state.background}
    streamScene={stream.state.scene}
    streamTime={stream.state.time}
  />

  <GameInputZone
    bind:textareaEl={inputEl}
    bind:input
    bind:actionMode
    {canUndoCancel}
    followStream={stream.follow}
    {isImpersonating}
    onSend={sendTurn}
    onFocus={scheduleKeyboardScroll}
    onCancelLastTurn={cancelLastTurn}
    onUndoCancelLastTurn={undoCancelLastTurn}
    onJumpToLatest={jumpToLatest}
    onRegenerateLastTurn={regenerateLastTurn}
    onImpersonatePlayer={impersonatePlayer}
    onGoHome={goHome}
  />
</div>
