<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from "svelte"
  import { AppError } from "@/errors"
  import type { StoryModules, TurnSummary, TurnVariantSummary } from "@/shared/types"
  import type { CustomFieldDef } from "@/shared/api-types"
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
  import { scrollToBottom } from "@/utils/scroll"
  import { isNearBottom } from "@/utils/scrollFollow"
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
    character,
    worldState,
    npcs,
    turns,
    isGenerating,
    resetGame,
    llmUpdateId,
  } from "@/stores/game"
  import { clearPendingTurn, getPendingTurn, setPendingTurn, type PendingTurn } from "@/features/game/pendingTurn"
  import { applyTurnState, appendTurnSummary } from "@/features/game/actions"
  import GameTopBar from "@/features/game/GameTopBar.svelte"
  import GameStoryArea from "@/features/game/GameStoryArea.svelte"
  import GameInputZone from "@/features/game/GameInputZone.svelte"
  import MemoryModal from "@/features/game/MemoryModal.svelte"
  import StoryModulesModal from "@/features/game/StoryModulesModal.svelte"
  import WorldFieldsModal from "@/features/game/WorldFieldsModal.svelte"

  type ActionMode = "do" | "say" | "story"

  let input = $state("")
  let actionMode = $state<ActionMode>("do")
  let storyDiv = $state<HTMLDivElement | null>(null)
  let inputEl = $state<HTMLTextAreaElement | null>(null)
  let editingOpening = $state(false)
  let openingDraft = $state("")
  let editingTurnId = $state<number | null>(null)
  let editPlayerInput = $state("")
  let editNarrative = $state("")
  let lastTurnVariants = $state<TurnVariantSummary[]>([])
  let activeVariantId = $state<number | null>(null)
  let variantsTurnId = $state<number | null>(null)
  let variantsLoading = $state(false)
  let canUndoCancel = $state(false)
  let showMemoryEditor = $state(false)
  let memoryDraft = $state("")
  let showWorldFieldsEditor = $state(false)
  let worldFieldsDraft = $state<Record<string, string | string[]>>({})
  let worldFieldsDefs = $state<CustomFieldDef[]>([])
  let worldFieldsSaving = $state(false)
  let showAuthorNoteEditor = $state(false)
  let authorNoteDraft = $state("")
  let authorNoteDepthDraft = $state(4)
  let authorNotePositionDraft = $state(1)
  let authorNoteIntervalDraft = $state(1)
  let authorNoteRoleDraft = $state(0)
  let authorNoteEmbedStateDraft = $state(false)
  let showModulesEditor = $state(false)
  let modulesDraft = $state<StoryModules>({ ...DEFAULT_STORY_MODULES })
  let flashScene = $state(false)
  let flashOpening = $state(false)
  let isImpersonating = $state(false)
  let lastSceneText = ""
  let lastOpeningText = ""
  let baselineWorldSet = false
  let lastLlmUpdateId = 0
  let sceneFlashTimer: number | null = null
  let openingFlashTimer: number | null = null
  let keyboardScrollTimer: number | null = null
  let lastViewportHeight = 0
  let streamUnsub = $state<null | (() => void)>(null)
  let streamNarrative = $state("")
  let streamBackground = $state("")
  let streamScene = $state("")
  let streamTime = $state("")
  let regeneratingTurnId = $state<number | null>(null)
  let followStream = $state(true)
  let followScrollPending = false

  let initialScrollDone = $state(false)
  let userActed = $state(false)
  let resumeAttemptedFor = ""

  function scrollStoryToBottom(opts?: Parameters<typeof scrollToBottom>[1]) {
    if (!storyDiv) return
    scrollToBottom(storyDiv, opts)
  }

  function lastTurnId(): number | null {
    return $turns.length > 0 ? $turns[$turns.length - 1].id : null
  }

  function stopTurnStream() {
    streamUnsub?.()
    streamUnsub = null
    streamNarrative = ""
    streamBackground = ""
    streamScene = ""
    streamTime = ""
  }

  function startTurnStream(requestId: string) {
    stopTurnStream()
    followStream = true
    if (!$streamingEnabled) return
    streamUnsub = subscribeStreamPreview(requestId, (patch) => {
      if (typeof patch.narrative_text === "string") streamNarrative = patch.narrative_text
      if (typeof patch.background_events === "string") streamBackground = patch.background_events
      if (typeof patch.current_scene === "string") streamScene = patch.current_scene
      if (typeof patch.time_of_day === "string") streamTime = patch.time_of_day
    })
  }

  function scheduleFollowScroll() {
    if (!followStream) return
    if (followScrollPending) return
    followScrollPending = true
    tick().then(() => {
      followScrollPending = false
      scrollStoryToBottom()
    })
  }

  function handleStoryScroll() {
    if (!$isGenerating || !$streamingEnabled) return
    followStream = storyDiv ? isNearBottom(storyDiv) : true
  }

  function jumpToLatest() {
    followStream = true
    tick().then(() => scrollStoryToBottom({ smooth: true }))
  }

  $effect(() => {
    if (!$isGenerating || !$streamingEnabled) return
    const _n = streamNarrative
    const _b = streamBackground
    const _s = streamScene
    const _t = streamTime
    scheduleFollowScroll()
  })

  function triggerSceneFlash() {
    flashScene = true
    if (sceneFlashTimer) window.clearTimeout(sceneFlashTimer)
    sceneFlashTimer = window.setTimeout(() => {
      flashScene = false
    }, INTERNAL_UI_FLASH_MS)
  }

  function triggerOpeningFlash() {
    flashOpening = true
    if (openingFlashTimer) window.clearTimeout(openingFlashTimer)
    openingFlashTimer = window.setTimeout(() => {
      flashOpening = false
    }, INTERNAL_UI_FLASH_MS)
  }

  function handleLlmWarnings(warnings?: string[]) {
    if (!warnings || warnings.length === 0) return
    console.warn("[llm] Repeated values from previous state:", warnings)
    const count = warnings.length
    showQuietNotice(`LLM repeated ${count} unchanged ${count === 1 ? "value" : "values"}.`)
  }

  async function sendTurn() {
    const rawText = input.trim()
    const isEmpty = rawText.length === 0
    const sendMode = isEmpty ? "story" : actionMode
    const text = isEmpty ? "" : normalizePlayerInput(rawText, actionMode)
    if ((!isEmpty && !text) || $isGenerating || !$currentStoryId) return
    const requestId = createRequestId()
    startTurnStream(requestId)
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
    isGenerating.set(true)
    try {
      const result = await turnsService.take($currentStoryId, text, sendMode, requestId)
      handleLlmWarnings(result.llm_warnings)
      applyTurnState(result)
      appendTurnSummary({ result, actionMode: sendMode, playerInput: text })
      canUndoCancel = false
      await loadVariants(result.turn_id, true)
      await tick()
      scrollStoryToBottom({ smooth: true })
      clearPendingTurn()
    } catch (err) {
      if (err instanceof AppError) {
        showError(err.message)
      } else {
        showError("Generation failed. Is KoboldCpp running?")
      }
    } finally {
      isGenerating.set(false)
      stopTurnStream()
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
      if (err instanceof AppError) {
        showError(err.message)
      } else {
        showError("Impersonate failed. Is KoboldCpp running?")
      }
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
    isGenerating.set(true)
    startTurnStream(pending.requestId)
    try {
      const result = await turnsService.take(
        $currentStoryId,
        pending.playerInput,
        pending.actionMode,
        pending.requestId,
      )
      handleLlmWarnings(result.llm_warnings)
      applyTurnState(result)
      const exists = $turns.some((t) => t.id === result.turn_id)
      if (!exists) {
        appendTurnSummary({
          result,
          actionMode: pending.actionMode,
          playerInput: pending.playerInput,
          activeVariantId: null,
        })
      }
      clearPendingTurn()
      await loadVariants(result.turn_id, true)
      await tick()
      scrollStoryToBottom({ smooth: true })
    } catch (err) {
      if (err instanceof AppError) {
        showError(err.message)
      } else {
        showError("Failed to resume generation")
      }
    } finally {
      isGenerating.set(false)
      stopTurnStream()
    }
  }

  $effect(() => {
    if (typeof window === "undefined") return
    if (!$currentStoryId) return
    const pending = getPendingTurn()
    if (!pending) return
    if (pending.storyId !== $currentStoryId) return
    if (pending.requestId === resumeAttemptedFor) return
    if (lastTurnId() !== pending.lastTurnId) {
      clearPendingTurn()
      return
    }
    resumeAttemptedFor = pending.requestId
    window.setTimeout(() => {
      void resumePendingTurn(pending)
    }, INTERNAL_UI_RESUME_PENDING_TURN_DELAY_MS)
  })

  async function regenerateLastTurn() {
    if ($isGenerating || !$currentStoryId || $turns.length === 0) return
    userActed = true
    isGenerating.set(true)
    const requestId = createRequestId()
    startTurnStream(requestId)
    regeneratingTurnId = $turns[$turns.length - 1]?.id ?? null
    try {
      const lastMode = $turns[$turns.length - 1]?.action_mode ?? actionMode
      const result = await turnsService.regenerateLast($currentStoryId, lastMode, requestId)
      handleLlmWarnings(result.llm_warnings)
      applyTurnState(result)
      turns.update((t) =>
        t.map((turn) =>
          turn.id === result.turn_id
            ? {
                ...turn,
                narrative_text: result.narrative_text,
                background_events: result.background_events,
                action_mode: lastMode,
                world: result.world,
              }
            : turn,
        ),
      )
      await loadVariants(result.turn_id, true)
      editingTurnId = null
      await tick()
      scrollStoryToBottom({ smooth: true })
    } catch (err) {
      if (err instanceof AppError) {
        showError(err.message)
      } else {
        showError("Generation failed. Is KoboldCpp running?")
      }
    } finally {
      isGenerating.set(false)
      regeneratingTurnId = null
      stopTurnStream()
    }
  }

  async function cancelLastTurn() {
    if ($isGenerating || !$currentStoryId || $turns.length === 0) return
    userActed = true
    isGenerating.set(true)
    try {
      const result = await turnsService.cancelLast($currentStoryId)
      applyTurnState(result, { markUpdate: false })
      let nextLastId: number | null = null
      turns.update((t) => {
        const remaining = t.filter((turn) => turn.id !== result.removed_turn_id)
        nextLastId = remaining[remaining.length - 1]?.id ?? null
        return remaining
      })
      canUndoCancel = true
      if (nextLastId) {
        await loadVariants(nextLastId, true)
      } else {
        lastTurnVariants = []
        activeVariantId = null
        variantsTurnId = null
      }
      editingTurnId = null
      await tick()
      scrollStoryToBottom({ smooth: true })
    } catch (err) {
      if (err instanceof AppError) {
        showError(err.message)
      } else {
        showError("Failed to cancel last turn")
      }
    } finally {
      isGenerating.set(false)
    }
  }

  async function undoCancelLastTurn() {
    if ($isGenerating || !$currentStoryId) return
    userActed = true
    isGenerating.set(true)
    try {
      const result = await turnsService.undoCancel($currentStoryId)
      applyTurnState(result)
      appendTurnSummary({
        result,
        actionMode: result.action_mode,
        playerInput: result.player_input,
        activeVariantId: result.active_variant_id,
      })
      canUndoCancel = false
      await loadVariants(result.turn_id, true)
      await tick()
      scrollStoryToBottom({ smooth: true })
    } catch (err) {
      if (err instanceof AppError) {
        showError(err.message)
      } else {
        showError("Failed to undo cancel")
      }
    } finally {
      isGenerating.set(false)
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
    memoryDraft = $worldState?.memory ?? ""
    showMemoryEditor = true
  }

  async function saveMemory() {
    if (!$currentStoryId) return
    const text = memoryDraft.trim()
    if (!text) {
      showError("Memory cannot be empty")
      return
    }
    try {
      const result = await stories.updateState($currentStoryId, { world: { memory: text } })
      worldState.set(result.world)
      showMemoryEditor = false
    } catch {
      showError("Failed to update memory")
    }
  }

  async function openWorldFieldsEditor() {
    worldFieldsDraft = { ...($worldState?.custom_fields ?? {}) }
    showWorldFieldsEditor = true
    try {
      worldFieldsDefs = await settingsService.customFields()
    } catch {
      showError("Failed to load custom fields")
    }
  }

  async function saveWorldFields() {
    if (!$currentStoryId) return
    try {
      worldFieldsSaving = true
      const result = await stories.updateState($currentStoryId, { world: { custom_fields: worldFieldsDraft } })
      worldState.set(result.world)
      showWorldFieldsEditor = false
    } catch {
      showError("Failed to update world fields")
    } finally {
      worldFieldsSaving = false
    }
  }

  function openAuthorNoteEditor() {
    authorNoteDraft = $currentStoryAuthorNote
    authorNoteDepthDraft = $currentStoryAuthorNoteDepth
    authorNotePositionDraft = $currentStoryAuthorNotePosition
    authorNoteIntervalDraft = $currentStoryAuthorNoteInterval
    authorNoteRoleDraft = $currentStoryAuthorNoteRole
    authorNoteEmbedStateDraft = $currentStoryAuthorNoteEmbedState
    showAuthorNoteEditor = true
  }

  async function saveAuthorNote() {
    if (!$currentStoryId) return
    try {
      const nextDepth = Math.max(0, Math.min(100, Math.floor(Number(authorNoteDepthDraft) || 0)))
      const nextPosition = Math.max(0, Math.min(2, Math.floor(Number(authorNotePositionDraft) || 0)))
      const nextInterval = Math.max(0, Math.min(1000, Math.floor(Number(authorNoteIntervalDraft) || 0)))
      const nextRole = Math.max(0, Math.min(2, Math.floor(Number(authorNoteRoleDraft) || 0)))
      await stories.update($currentStoryId, {
        author_note: authorNoteDraft,
        author_note_depth: nextDepth,
        author_note_position: nextPosition,
        author_note_interval: nextInterval,
        author_note_role: nextRole,
        author_note_embed_state: authorNoteEmbedStateDraft,
      })
      currentStoryAuthorNote.set(authorNoteDraft)
      currentStoryAuthorNoteDepth.set(nextDepth)
      currentStoryAuthorNotePosition.set(nextPosition)
      currentStoryAuthorNoteInterval.set(nextInterval)
      currentStoryAuthorNoteRole.set(nextRole)
      currentStoryAuthorNoteEmbedState.set(authorNoteEmbedStateDraft)
      showAuthorNoteEditor = false
    } catch {
      showError("Failed to update author's note")
    }
  }

  function openModulesEditor() {
    modulesDraft = $currentStoryModules ?? { ...DEFAULT_STORY_MODULES }
    showModulesEditor = true
  }

  async function saveModules() {
    if (!$currentStoryId) return
    try {
      await stories.update($currentStoryId, { story_modules: modulesDraft })
      currentStoryModules.set(modulesDraft)
      showModulesEditor = false
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
        await loadVariants(remaining[remaining.length - 1].id, true)
      } else {
        lastTurnVariants = []
        activeVariantId = null
        variantsTurnId = null
      }
    } catch {
      showError("Failed to delete turn")
    }
  }

  function scheduleKeyboardScroll() {
    if (keyboardScrollTimer) window.clearTimeout(keyboardScrollTimer)
    requestAnimationFrame(() => scrollStoryToBottom())
    keyboardScrollTimer = window.setTimeout(() => scrollStoryToBottom(), INTERNAL_UI_KEYBOARD_SCROLL_DELAY_MS)
  }

  function goHome() {
    navigate("home", { reset: true })
  }

  async function loadVariants(turnId: number, force = false) {
    if (!turnId || variantsLoading) return
    if (!force && variantsTurnId === turnId && lastTurnVariants.length > 0) return
    variantsLoading = true
    try {
      const res = await turnsService.variants(turnId)
      lastTurnVariants = res.variants
      activeVariantId = res.active_variant_id
      variantsTurnId = turnId
    } catch (err) {
      console.error("Failed to load turn variants", err)
      lastTurnVariants = []
      activeVariantId = null
      variantsTurnId = turnId
    } finally {
      variantsLoading = false
    }
  }

  async function selectVariant(variantId: number) {
    if ($isGenerating || !$currentStoryId || !variantsTurnId) return
    userActed = true
    isGenerating.set(true)
    try {
      const result = await turnsService.selectVariant(variantsTurnId, variantId)
      applyTurnState(result)
      turns.update((t) =>
        t.map((turn) =>
          turn.id === result.turn_id
            ? {
                ...turn,
                narrative_text: result.narrative_text,
                background_events: result.background_events,
                active_variant_id: result.active_variant_id,
                world: result.world,
              }
            : turn,
        ),
      )
      activeVariantId = result.active_variant_id
      await tick()
      scrollStoryToBottom({ smooth: true })
    } catch (err) {
      if (err instanceof AppError) {
        showError(err.message)
      } else {
        showError("Failed to switch version")
      }
    } finally {
      isGenerating.set(false)
    }
  }

  $effect(() => {
    const len = $turns.length
    if (len > 0) {
      const lastId = $turns[len - 1].id
      untrack(() => {
        if (variantsTurnId !== lastId) {
          loadVariants(lastId).then(() => {
            if (!initialScrollDone) {
              initialScrollDone = true
              tick().then(() => requestAnimationFrame(() => scrollStoryToBottom()))
            }
          })
        }
      })
    } else {
      untrack(() => {
        if (variantsTurnId !== null) {
          lastTurnVariants = []
          activeVariantId = null
          variantsTurnId = null
        }
      })
    }
  })

  $effect(() => {
    const ws = $worldState
    const opening = $currentStoryOpeningScenario
    untrack(() => {
      if (!baselineWorldSet && (ws || opening)) {
        lastSceneText = ws ? `${ws.current_scene} · ${ws.time_of_day}` : ""
        lastOpeningText = opening || ws?.memory || ""
        baselineWorldSet = true
      }
    })
  })

  $effect(() => {
    const updateId = $llmUpdateId
    const ws = $worldState
    const opening = $currentStoryOpeningScenario
    untrack(() => {
      if (updateId !== lastLlmUpdateId) {
        const sceneText = ws ? `${ws.current_scene} · ${ws.time_of_day}` : ""
        const openingText = opening || ws?.memory || ""
        if (baselineWorldSet) {
          if (sceneText && sceneText !== lastSceneText) {
            triggerSceneFlash()
          }
          if (openingText && openingText !== lastOpeningText) {
            triggerOpeningFlash()
          }
        }
        lastSceneText = sceneText
        lastOpeningText = openingText
        lastLlmUpdateId = updateId
      }
    })
  })

  $effect(() => {
    const storyId = $currentStoryId
    untrack(() => {
      if (!storyId) {
        baselineWorldSet = false
        lastSceneText = ""
        lastOpeningText = ""
        flashScene = false
        flashOpening = false
        canUndoCancel = false
        if (sceneFlashTimer) window.clearTimeout(sceneFlashTimer)
        if (openingFlashTimer) window.clearTimeout(openingFlashTimer)
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
      if (keyboardScrollTimer) window.clearTimeout(keyboardScrollTimer)
    }
  })

  onDestroy(() => {
    if (sceneFlashTimer) window.clearTimeout(sceneFlashTimer)
    if (openingFlashTimer) window.clearTimeout(openingFlashTimer)
    if (keyboardScrollTimer) window.clearTimeout(keyboardScrollTimer)
    stopTurnStream()
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
    open={showMemoryEditor}
    disabled={$isGenerating}
    bind:draft={memoryDraft}
    onCancel={() => (showMemoryEditor = false)}
    onSave={saveMemory}
  />

  <WorldFieldsModal
    open={showWorldFieldsEditor}
    disabled={$isGenerating || worldFieldsSaving}
    defs={worldFieldsDefs}
    values={worldFieldsDraft}
    setValues={(next) => (worldFieldsDraft = next)}
    onCancel={() => (showWorldFieldsEditor = false)}
    onSave={() => void saveWorldFields()}
  />

  <!-- ── Author's Note editor overlay ──────────────────── -->
  <AuthorsNoteModal
    open={showAuthorNoteEditor}
    disabled={$isGenerating}
    bind:note={authorNoteDraft}
    bind:position={authorNotePositionDraft}
    bind:depth={authorNoteDepthDraft}
    bind:interval={authorNoteIntervalDraft}
    bind:role={authorNoteRoleDraft}
    bind:embedState={authorNoteEmbedStateDraft}
    onCancel={() => (showAuthorNoteEditor = false)}
    onSave={saveAuthorNote}
  />

  <StoryModulesModal
    open={showModulesEditor}
    disabled={$isGenerating}
    bind:modules={modulesDraft}
    onCancel={() => (showModulesEditor = false)}
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
    {lastTurnVariants}
    {activeVariantId}
    {selectVariant}
    {handleStoryScroll}
    {streamNarrative}
    {streamBackground}
    {streamScene}
    {streamTime}
  />

  <GameInputZone
    bind:textareaEl={inputEl}
    bind:input
    bind:actionMode
    {canUndoCancel}
    {followStream}
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
