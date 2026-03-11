<script lang="ts">
  import { onMount, tick, untrack } from "svelte"
  import { api, type TurnSummary, type TurnVariantSummary, ApiError } from "../api/client.js"
  import {
    navigate,
    showCharSheet,
    showNPCTracker,
    showLocations,
    showError,
    showConfirm,
    showQuietNotice,
  } from "../stores/ui.js"
  import { autoresize } from "./actions/autoresize.js"
  import IconDots from "../icons/IconDots.svelte"
  import IconFace from "../icons/IconFace.svelte"
  import IconHome from "../icons/IconHome.svelte"
  import IconMapPin from "../icons/IconMapPin.svelte"
  import IconPencilSquare from "../icons/IconPencilSquare.svelte"
  import IconSend from "../icons/IconSend.svelte"
  import IconSpinner from "../icons/IconSpinner.svelte"
  import IconTrash from "../icons/IconTrash.svelte"
  import IconUser from "../icons/IconUser.svelte"
  import IconUsers from "../icons/IconUsers.svelte"
  import {
    currentStoryId,
    currentStoryTitle,
    currentStoryOpeningScenario,
    currentStoryAuthorNote,
    currentStoryAuthorNoteDepth,
    currentStoryInitialWorld,
    character,
    worldState,
    npcs,
    turns,
    isGenerating,
    resetGame,
    llmUpdateId,
    markLlmUpdate,
  } from "../stores/game.js"

  type ActionMode = "do" | "say" | "story"
  const ACTION_MODES: ActionMode[] = ["do", "say", "story"]
  const MODE_HINTS: Record<ActionMode, string> = {
    do: "What do you do?",
    say: "What do you say?",
    story: "Write story text directly...",
  }

  let input = $state("")
  let actionMode = $state<ActionMode>("do")
  let storyDiv: HTMLDivElement
  let inputEl: HTMLTextAreaElement | null = null
  let showMenu = $state(false)
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
  let showAuthorNoteEditor = $state(false)
  let authorNoteDraft = $state("")
  let authorNoteDepthDraft = $state(4)
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

  let initialScrollDone = $state(false)
  let userActed = $state(false)
  let resumeAttemptedFor = ""

  const PENDING_TURN_KEY = "pending_turn"
  type PendingTurn = {
    storyId: number
    actionMode: ActionMode
    playerInput: string
    requestId: string
    lastTurnId: number | null
    createdAt: number
  }

  function getPendingTurn(): PendingTurn | null {
    try {
      const raw = window.localStorage.getItem(PENDING_TURN_KEY)
      if (!raw) return null
      return JSON.parse(raw) as PendingTurn
    } catch {
      return null
    }
  }

  function setPendingTurn(pending: PendingTurn) {
    try {
      window.localStorage.setItem(PENDING_TURN_KEY, JSON.stringify(pending))
    } catch {
      // ignore storage failures
    }
  }

  function clearPendingTurn() {
    try {
      window.localStorage.removeItem(PENDING_TURN_KEY)
    } catch {
      // ignore storage failures
    }
  }

  function lastTurnId(): number | null {
    return $turns.length > 0 ? $turns[$turns.length - 1].id : null
  }

  function createRequestId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
  }

  function triggerSceneFlash() {
    flashScene = true
    if (sceneFlashTimer) window.clearTimeout(sceneFlashTimer)
    sceneFlashTimer = window.setTimeout(() => {
      flashScene = false
    }, 900)
  }

  function triggerOpeningFlash() {
    flashOpening = true
    if (openingFlashTimer) window.clearTimeout(openingFlashTimer)
    openingFlashTimer = window.setTimeout(() => {
      flashOpening = false
    }, 900)
  }

  function matchCase(match: string, replacement: string): string {
    if (match.toUpperCase() === match) return replacement.toUpperCase()
    if (match[0] === match[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.substring(1)
    return replacement
  }

  function normalizeDoInput(text: string): string {
    let normalized = text
    normalized = normalized.replace(/\bmyself\b/gi, (m) => matchCase(m, "yourself"))
    normalized = normalized.replace(/\bmy\b/gi, (m) => matchCase(m, "your"))
    if (!/^(you|your|yourself)\b/i.test(normalized)) {
      const lowered = normalized.replace(/^([A-Z])/, (m) => m.toLowerCase())
      normalized = `You ${lowered}`
    }
    return normalized
  }

  function normalizeSayInput(text: string): string {
    if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) return text
    return `"${text}"`
  }

  function normalizePlayerInput(text: string, mode?: ActionMode): string {
    const trimmed = text.trim()
    if (!trimmed) return trimmed
    if (mode === "do") return normalizeDoInput(trimmed)
    if (mode === "say") return normalizeSayInput(trimmed)
    return trimmed
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
      const result = await api.turns.take($currentStoryId, text, sendMode, requestId)
      handleLlmWarnings(result.llm_warnings)
      character.set(result.character)
      worldState.set(result.world)
      npcs.set(result.npcs)
      markLlmUpdate()
      const newTurn: TurnSummary = {
        id: result.turn_id,
        turn_number: result.turn_number,
        action_mode: sendMode,
        player_input: text,
        narrative_text: result.narrative_text,
        world: result.world,
        created_at: new Date().toISOString(),
      }
      turns.update((t) => [...t, newTurn])
      canUndoCancel = false
      await loadVariants(result.turn_id, true)
      await tick()
      scrollToBottom(true)
      clearPendingTurn()
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message)
      } else {
        showError("Generation failed. Is KoboldCpp running?")
      }
    } finally {
      isGenerating.set(false)
    }
  }

  async function impersonatePlayer() {
    if ($isGenerating || isImpersonating || !$currentStoryId) return
    isImpersonating = true
    try {
      const result = await api.turns.impersonate($currentStoryId, actionMode)
      const action = result.player_action?.trim()
      if (!action) {
        showQuietNotice("Impersonate returned an empty action.")
        return
      }
      input = action
      await tick()
    } catch (err) {
      if (err instanceof ApiError) {
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
    try {
      const result = await api.turns.take($currentStoryId, pending.playerInput, pending.actionMode, pending.requestId)
      handleLlmWarnings(result.llm_warnings)
      character.set(result.character)
      worldState.set(result.world)
      npcs.set(result.npcs)
      markLlmUpdate()
      const exists = $turns.some((t) => t.id === result.turn_id)
      if (!exists) {
        const newTurn: TurnSummary = {
          id: result.turn_id,
          turn_number: result.turn_number,
          action_mode: pending.actionMode,
          active_variant_id: null,
          player_input: pending.playerInput,
          narrative_text: result.narrative_text,
          world: result.world,
          created_at: new Date().toISOString(),
        }
        turns.update((t) => [...t, newTurn])
      }
      clearPendingTurn()
      await loadVariants(result.turn_id, true)
      await tick()
      scrollToBottom(true)
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message)
      } else {
        showError("Failed to resume generation")
      }
    } finally {
      isGenerating.set(false)
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
    }, 500)
  })

  async function regenerateLastTurn() {
    if ($isGenerating || !$currentStoryId || $turns.length === 0) return
    userActed = true
    isGenerating.set(true)
    try {
      const lastMode = $turns[$turns.length - 1]?.action_mode ?? actionMode
      const result = await api.turns.regenerateLast($currentStoryId, lastMode)
      handleLlmWarnings(result.llm_warnings)
      character.set(result.character)
      worldState.set(result.world)
      npcs.set(result.npcs)
      markLlmUpdate()
      turns.update((t) =>
        t.map((turn) =>
          turn.id === result.turn_id
            ? { ...turn, narrative_text: result.narrative_text, action_mode: lastMode, world: result.world }
            : turn,
        ),
      )
      await loadVariants(result.turn_id, true)
      editingTurnId = null
      await tick()
      scrollToBottom(true)
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message)
      } else {
        showError("Generation failed. Is KoboldCpp running?")
      }
    } finally {
      isGenerating.set(false)
    }
  }

  async function cancelLastTurn() {
    if ($isGenerating || !$currentStoryId || $turns.length === 0) return
    userActed = true
    isGenerating.set(true)
    try {
      const result = await api.turns.cancelLast($currentStoryId)
      character.set(result.character)
      worldState.set(result.world)
      npcs.set(result.npcs)
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
      scrollToBottom(true)
    } catch (err) {
      if (err instanceof ApiError) {
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
      const result = await api.turns.undoCancel($currentStoryId)
      character.set(result.character)
      worldState.set(result.world)
      npcs.set(result.npcs)
      const restoredTurn: TurnSummary = {
        id: result.turn_id,
        turn_number: result.turn_number,
        action_mode: result.action_mode,
        active_variant_id: result.active_variant_id,
        player_input: result.player_input,
        narrative_text: result.narrative_text,
        world: result.world,
        created_at: new Date().toISOString(),
      }
      turns.update((t) => [...t, restoredTurn])
      canUndoCancel = false
      await loadVariants(result.turn_id, true)
      await tick()
      scrollToBottom(true)
    } catch (err) {
      if (err instanceof ApiError) {
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
      await api.stories.update($currentStoryId, { opening_scenario: text })
      currentStoryOpeningScenario.set(text)
      editingOpening = false
    } catch {
      showError("Failed to update opening scenario")
    }
  }

  function openMemoryEditor() {
    memoryDraft = $worldState?.memory ?? ""
    showMemoryEditor = true
    showMenu = false
  }

  async function saveMemory() {
    if (!$currentStoryId) return
    const text = memoryDraft.trim()
    if (!text) {
      showError("Memory cannot be empty")
      return
    }
    try {
      const result = await api.stories.updateState($currentStoryId, { world: { memory: text } })
      worldState.set(result.world)
      showMemoryEditor = false
    } catch {
      showError("Failed to update memory")
    }
  }

  function openAuthorNoteEditor() {
    authorNoteDraft = $currentStoryAuthorNote
    authorNoteDepthDraft = $currentStoryAuthorNoteDepth
    showAuthorNoteEditor = true
    showMenu = false
  }

  async function saveAuthorNote() {
    if (!$currentStoryId) return
    try {
      await api.stories.update($currentStoryId, {
        author_note: authorNoteDraft,
        author_note_depth: authorNoteDepthDraft,
      })
      currentStoryAuthorNote.set(authorNoteDraft)
      currentStoryAuthorNoteDepth.set(authorNoteDepthDraft)
      showAuthorNoteEditor = false
    } catch {
      showError("Failed to update author's note")
    }
  }

  function startEditTurn(turn: TurnSummary) {
    editingTurnId = turn.id
    editPlayerInput = turn.player_input
    editNarrative = turn.narrative_text
    // autoresize uses rAF internally, so wait for tick + 2 rAFs to ensure textareas are sized
    tick().then(() =>
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => scrollToBottom(true)))),
    )
  }

  function cancelEditTurn() {
    editingTurnId = null
  }

  async function saveTurnEdit(turnId: number) {
    const turnMode = $turns.find((turn) => turn.id === turnId)?.action_mode
    const playerInput = normalizePlayerInput(editPlayerInput, turnMode)
    const narrative = editNarrative.trim()
    if (!playerInput || !narrative) {
      showError("Player input and narrative text are required")
      return
    }
    try {
      await api.turns.update(turnId, { player_input: playerInput, narrative_text: narrative })
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
      await api.turns.delete(turnId)
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

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendTurn()
    }
  }

  function scrollToBottom(smooth = false) {
    if (storyDiv) {
      if (smooth) {
        storyDiv.scrollTo({ top: storyDiv.scrollHeight, behavior: "smooth" })
      } else {
        storyDiv.scrollTop = storyDiv.scrollHeight
      }
    }
  }

  function scheduleKeyboardScroll() {
    if (keyboardScrollTimer) window.clearTimeout(keyboardScrollTimer)
    requestAnimationFrame(() => scrollToBottom())
    keyboardScrollTimer = window.setTimeout(() => scrollToBottom(), 120)
  }

  function goHome() {
    resetGame()
    navigate("home", { reset: true })
  }

  // Split narrative into paragraphs for proper rendering
  function paragraphs(text: string): string[] {
    let normalized = text.replace(/\r\n/g, "\n")
    if (!normalized.includes("\n") && normalized.includes("\\n")) {
      normalized = normalized.replace(/\\n/g, "\n")
    }
    const hasBlankLines = /\n\s*\n/.test(normalized)
    return normalized
      .split(hasBlankLines ? /\n\s*\n+/ : /\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
  }

  type InlineMatch = {
    type: "code" | "dquote" | "squote"
    start: number
    end: number
    inner: string
  }

  type InlineToken = {
    type: "text" | "code" | "dquote" | "squote"
    content: string
  }

  function isWordChar(ch: string): boolean {
    return /[A-Za-z0-9_]/.test(ch)
  }

  function isApostrophe(text: string, index: number): boolean {
    const prev = index > 0 ? text[index - 1] : ""
    const next = index + 1 < text.length ? text[index + 1] : ""
    return isWordChar(prev) && isWordChar(next)
  }

  function findCode(text: string, from: number): InlineMatch | null {
    const re = /`([^`\n]+)`/g
    re.lastIndex = from
    const match = re.exec(text)
    if (!match) return null
    return { type: "code", start: match.index, end: match.index + match[0].length, inner: match[1] }
  }

  function findDQuote(text: string, from: number): InlineMatch | null {
    const re = /"([^"\n]+)"/g
    re.lastIndex = from
    const match = re.exec(text)
    if (!match) return null
    return { type: "dquote", start: match.index, end: match.index + match[0].length, inner: match[1] }
  }

  function findSQuote(text: string, from: number): InlineMatch | null {
    let start = text.indexOf("'", from)
    while (start !== -1) {
      const prev = start > 0 ? text[start - 1] : ""
      if (!isApostrophe(text, start) && !isWordChar(prev)) {
        let end = start + 1
        while (end < text.length) {
          if (text[end] === "'" && !isApostrophe(text, end)) {
            const inner = text.slice(start + 1, end)
            if (!inner.includes("\n")) {
              return { type: "squote", start, end: end + 1, inner }
            }
            break
          }
          end += 1
        }
      }
      start = text.indexOf("'", start + 1)
    }
    return null
  }

  function tokenizeInline(text: string): InlineToken[] {
    if (!text) return []
    const tokens: InlineToken[] = []
    let index = 0
    const priority: Record<InlineMatch["type"], number> = { code: 0, dquote: 1, squote: 2 }
    while (index < text.length) {
      const candidates = [findCode(text, index), findDQuote(text, index), findSQuote(text, index)].filter(
        (m): m is InlineMatch => m !== null,
      )
      if (candidates.length === 0) {
        tokens.push({ type: "text", content: text.substring(index) })
        break
      }
      candidates.sort((a, b) => (a.start === b.start ? priority[a.type] - priority[b.type] : a.start - b.start))
      const next = candidates[0]
      if (next.start > index) {
        tokens.push({ type: "text", content: text.substring(index, next.start) })
      }
      if (next.type === "code") {
        tokens.push({ type: "code", content: next.inner })
      } else if (next.type === "dquote") {
        tokens.push({ type: "dquote", content: next.inner })
      } else {
        tokens.push({ type: "squote", content: next.inner })
      }
      index = next.end
    }
    return tokens
  }

  async function loadVariants(turnId: number, force = false) {
    if (!turnId || variantsLoading) return
    if (!force && variantsTurnId === turnId && lastTurnVariants.length > 0) return
    variantsLoading = true
    try {
      const res = await api.turns.variants(turnId)
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
      const result = await api.turns.selectVariant(variantsTurnId, variantId)
      character.set(result.character)
      worldState.set(result.world)
      npcs.set(result.npcs)
      markLlmUpdate()
      turns.update((t) =>
        t.map((turn) =>
          turn.id === result.turn_id
            ? {
                ...turn,
                narrative_text: result.narrative_text,
                active_variant_id: result.active_variant_id,
                world: result.world,
              }
            : turn,
        ),
      )
      activeVariantId = result.active_variant_id
      await tick()
      scrollToBottom(true)
    } catch (err) {
      if (err instanceof ApiError) {
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
              tick().then(() => requestAnimationFrame(() => scrollToBottom()))
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
        lastSceneText = ws ? `${ws.current_scene} · ${ws.current_date} · ${ws.time_of_day}` : ""
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
        const sceneText = ws ? `${ws.current_scene} · ${ws.current_date} · ${ws.time_of_day}` : ""
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
</script>

<div class="screen game">
  <!-- ── Top bar ─────────────────────────────────────────── -->
  <header>
    <button class="header-back" onclick={goHome} title="Return to menu" aria-label="Back to stories">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg
      >
    </button>

    <div class="header-center">
      <span class="story-name">{$currentStoryTitle}</span>
      {#if $worldState}
        <span class="header-scene" class:flash={flashScene}>
          {$worldState.current_scene} · {$worldState.current_date} · {$worldState.time_of_day}
        </span>
      {/if}
    </div>

    <div class="header-actions">
      <span class="turn-badge">{$turns.length}</span>
      <button class="hbtn mobile-only" title="Character Sheet" onclick={() => showCharSheet.update((v) => !v)}>
        <IconUser size={15} strokeWidth={1.8} />
      </button>
      <button class="hbtn mobile-only" title="NPC Tracker" onclick={() => showNPCTracker.update((v) => !v)}>
        <IconUsers size={15} strokeWidth={1.8} />
      </button>
      <button class="hbtn mobile-only" title="Locations" onclick={() => showLocations.update((v) => !v)}>
        <IconMapPin size={15} strokeWidth={1.8} />
      </button>
      <div class="menu-wrap">
        <button class="hbtn" aria-label="More options" onclick={() => (showMenu = !showMenu)}>
          <IconDots size={15} strokeWidth={1.8} />
        </button>
        {#if showMenu}
          <div class="dropdown">
            <button onclick={openMemoryEditor}>Memory</button>
            <button onclick={openAuthorNoteEditor}>Author's Note</button>
            {#if $currentStoryId}
              <a href={api.stories.exportUrl($currentStoryId, "neuradventure")} download class="dropdown-link"
                >Export JSON</a
              >
              <a href={api.stories.exportUrl($currentStoryId, "tavern")} download class="dropdown-link"
                >Export ST Chat</a
              >
              <a href={api.stories.exportUrl($currentStoryId, "plaintext")} download class="dropdown-link"
                >Export Text</a
              >
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </header>

  <!-- ── Memory editor overlay ─────────────────────────── -->
  {#if showMemoryEditor}
    <div class="editor-overlay">
      <div class="editor-panel">
        <div class="editor-header">
          <span>Memory</span>
          <span class="editor-hint">Persistent summary — updated by AI each turn, editable by you</span>
        </div>
        <textarea class="edit-textarea" bind:value={memoryDraft} rows="6" use:autoresize={memoryDraft}></textarea>
        <div class="edit-actions">
          <button class="btn-ghost" onclick={() => (showMemoryEditor = false)}>Cancel</button>
          <button class="btn-accent" onclick={saveMemory}>Save</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ── Author's Note editor overlay ──────────────────── -->
  {#if showAuthorNoteEditor}
    <div class="editor-overlay">
      <div class="editor-panel">
        <div class="editor-header">
          <span>Author's Note</span>
          <span class="editor-hint">Injected into the prompt at the specified depth in history</span>
        </div>
        <textarea
          class="edit-textarea"
          bind:value={authorNoteDraft}
          rows="4"
          placeholder="e.g. Focus on dialogue and character emotions"
          use:autoresize={authorNoteDraft}
        ></textarea>
        <div class="depth-row">
          <label for="an-depth">Depth (entries from bottom):</label>
          <input id="an-depth" type="number" min="0" max="100" bind:value={authorNoteDepthDraft} class="depth-input" />
        </div>
        <div class="edit-actions">
          <button class="btn-ghost" onclick={() => (showAuthorNoteEditor = false)}>Cancel</button>
          <button class="btn-accent" onclick={saveAuthorNote}>Save</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ── Story scroll area ───────────────────────────────── -->
  <div
    class="story-area"
    class:story-ready={initialScrollDone || $turns.length === 0}
    data-scroll-root="screen"
    bind:this={storyDiv}
  >
    <!-- Opening scene context -->
    {#if $worldState}
      <p class="scene-crumb mobile-only" class:flash={flashScene}>
        {$worldState.current_scene} · {$worldState.current_date} · {$worldState.time_of_day}
      </p>
    {/if}

    <div class="opening-block">
      <div class="opening-header">
        <span>Opening</span>
        {#if !editingOpening}
          <button class="edit-btn" onclick={startEditOpening} disabled={$isGenerating}>Edit</button>
        {/if}
      </div>
      {#if $currentStoryInitialWorld}
        <p class="opening-scene">
          {$currentStoryInitialWorld.current_scene} · {$currentStoryInitialWorld.current_date} · {$currentStoryInitialWorld.time_of_day}
        </p>
      {/if}
      {#if editingOpening}
        <textarea
          class="edit-textarea"
          bind:value={openingDraft}
          rows="6"
          disabled={$isGenerating}
          use:autoresize={openingDraft}
        ></textarea>
        <div class="edit-actions">
          <button class="btn-ghost" onclick={cancelEditOpening} disabled={$isGenerating}>Cancel</button>
          <button class="btn-accent" onclick={saveOpening} disabled={$isGenerating}>Save</button>
        </div>
      {:else}
        <p class="opening-text" class:flash={flashOpening}>
          {#each tokenizeInline($currentStoryOpeningScenario || $worldState?.memory || "") as token}
            {#if token.type === "text"}
              {token.content}
            {:else if token.type === "code"}
              <span class="inline-code">{token.content}</span>
            {:else if token.type === "dquote"}
              <span class="inline-quote">"{token.content}"</span>
            {:else}
              <span class="inline-quote">'{token.content}'</span>
            {/if}
          {/each}
        </p>
      {/if}
    </div>

    {#each $turns as turn, i (turn.id)}
      {#if editingTurnId === turn.id}
        <div class="edit-turn">
          <label class="edit-label" for="edit-player-input">Player Input</label>
          <textarea
            id="edit-player-input"
            class="edit-textarea"
            bind:value={editPlayerInput}
            rows="2"
            disabled={$isGenerating}
            use:autoresize={editPlayerInput}
          ></textarea>
          <label class="edit-label" for="edit-narrative">Story Text</label>
          <textarea
            id="edit-narrative"
            class="edit-textarea"
            bind:value={editNarrative}
            rows="6"
            disabled={$isGenerating}
            use:autoresize={editNarrative}
          ></textarea>
          <div class="edit-actions">
            <button class="btn-ghost" onclick={cancelEditTurn} disabled={$isGenerating}>Cancel</button>
            <button class="btn-accent" onclick={() => saveTurnEdit(turn.id)} disabled={$isGenerating}>Save</button>
          </div>
        </div>
      {:else}
        <!-- Player action inline — matches AI Dungeon's "pencil" style -->
        <div class="action-inline" class:fresh={userActed && i === $turns.length - 1 && !$isGenerating}>
          {#if turn.player_input.trim().length > 0}
            <IconPencilSquare className="pencil-icon" size={12} strokeWidth={2} />
          {/if}
          <span class="action-text">
            {#each tokenizeInline(turn.player_input) as token}
              {#if token.type === "text"}
                {token.content}
              {:else if token.type === "code"}
                <span class="inline-code">{token.content}</span>
              {:else if token.type === "dquote"}
                <span class="inline-quote">"{token.content}"</span>
              {:else}
                <span class="inline-quote">'{token.content}'</span>
              {/if}
            {/each}
          </span>
          <button class="edit-btn inline" onclick={() => startEditTurn(turn)} disabled={$isGenerating}>Edit</button>
          <button
            class="delete-btn inline"
            onclick={() => deleteTurn(turn.id)}
            disabled={$isGenerating}
            title="Delete turn"
          >
            <IconTrash size={12} strokeWidth={2} />
          </button>
        </div>

        <!-- Narrative paragraphs -->
        <div class="narrative-block" class:fresh={userActed && i === $turns.length - 1 && !$isGenerating}>
          {#if turn.world}
            <p class="turn-scene">{turn.world.current_scene} · {turn.world.current_date} · {turn.world.time_of_day}</p>
          {/if}
          {#each paragraphs(turn.narrative_text) as para, j}
            <p class="para" style="animation-delay: {j * 0.06}s">
              {#each tokenizeInline(para) as token}
                {#if token.type === "text"}
                  {token.content}
                {:else if token.type === "code"}
                  <span class="inline-code">{token.content}</span>
                {:else if token.type === "dquote"}
                  <span class="inline-quote">"{token.content}"</span>
                {:else}
                  <span class="inline-quote">'{token.content}'</span>
                {/if}
              {/each}
            </p>
          {/each}

          {#if i === $turns.length - 1 && lastTurnVariants.length > 1}
            <div class="variant-row">
              <span class="variant-label">Versions</span>
              {#each lastTurnVariants as variant}
                <button
                  class="variant-pill {activeVariantId === variant.id ? 'active' : ''}"
                  onclick={() => selectVariant(variant.id)}
                  disabled={$isGenerating}
                  title={`Version ${variant.variant_index}`}
                >
                  v{variant.variant_index}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {/each}

    {#if $isGenerating}
      <div class="thinking">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>
    {/if}

    <!-- Breathing room at bottom -->
    <div style="height:1rem"></div>
  </div>

  <!-- ── Input zone ──────────────────────────────────────── -->
  <div class="input-zone">
    <!-- Mode selector row — AI Dungeon style -->
    <div class="mode-row">
      <button class="mode-clear" onclick={() => (input = "")} disabled={!input} aria-label="Clear"> × </button>

      <div class="mode-group" role="group" aria-label="Action mode">
        {#each ACTION_MODES as mode}
          <button class="mode-pill {actionMode === mode ? 'active' : ''}" onclick={() => (actionMode = mode)}
            >{mode}</button
          >
        {/each}
      </div>

      <button
        class="mode-undo"
        onclick={cancelLastTurn}
        disabled={$isGenerating || $turns.length === 0}
        title="Cancel last turn"
        aria-label="Cancel last turn"
      >
        ↶
      </button>

      {#if canUndoCancel}
        <button
          class="mode-undo-cancel"
          onclick={undoCancelLastTurn}
          disabled={$isGenerating}
          title="Undo cancel"
          aria-label="Undo cancel"
        >
          ↷
        </button>
      {/if}

      <button
        class="mode-regen"
        onclick={regenerateLastTurn}
        disabled={$isGenerating || $turns.length === 0}
        title="Regenerate last turn"
        aria-label="Regenerate last turn"
      >
        ↻
      </button>

      <button
        class="mode-impersonate"
        onclick={impersonatePlayer}
        disabled={$isGenerating || isImpersonating}
        title="Impersonate player action"
        aria-label="Impersonate player action"
      >
        {#if isImpersonating}
          <IconSpinner className="spin" size={14} strokeWidth={2.2} />
        {:else}
          <IconFace size={14} strokeWidth={2} />
        {/if}
      </button>

      <button class="send-btn" onclick={sendTurn} disabled={$isGenerating} aria-label="Send">
        {#if $isGenerating}
          <IconSpinner className="spin" size={16} strokeWidth={2.2} />
        {:else}
          <IconSend size={16} strokeWidth={2.2} />
        {/if}
      </button>
    </div>

    <!-- Text input -->
    <textarea
      bind:this={inputEl}
      bind:value={input}
      placeholder={MODE_HINTS[actionMode]}
      rows="2"
      disabled={$isGenerating}
      onkeydown={handleKeydown}
      onfocus={scheduleKeyboardScroll}
      use:autoresize={input}
    ></textarea>

    <!-- Bottom toolbar -->
    <div class="toolbar">
      <button class="tbtn" onclick={goHome} title="Stories">
        <IconHome size={14} strokeWidth={1.8} />
      </button>
      <button class="tbtn" onclick={() => showCharSheet.update((v) => !v)} title="Character">
        <IconUser size={14} strokeWidth={1.8} />
      </button>
      <button class="tbtn" onclick={() => showNPCTracker.update((v) => !v)} title="NPCs">
        <IconUsers size={14} strokeWidth={1.8} />
      </button>
      <button class="tbtn" onclick={() => showLocations.update((v) => !v)} title="Locations">
        <IconMapPin size={14} strokeWidth={1.8} />
      </button>
    </div>
  </div>
</div>

<style>
  .game {
    position: relative;
    overflow: hidden;
    max-width: none;
  }

  /* ── Header ─────────────────────────────────────────── */
  header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.5rem 0 0;
    border-bottom: 1px solid var(--border);
    min-height: 46px;
    flex-shrink: 0;
  }
  @media (min-width: 1200px) {
    header {
      padding: 0 1.5rem 0 0;
    }
  }
  .header-back {
    background: none;
    border: none;
    border-right: 1px solid var(--border);
    color: var(--text-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    min-height: 46px;
    flex-shrink: 0;
    transition:
      color 0.15s,
      background 0.15s;
  }
  .header-back:hover {
    color: var(--text);
    background: var(--bg-action);
  }
  .header-center {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.35rem 0;
  }
  .story-name {
    font-family: var(--font-ui);
    font-size: 0.82rem;
    color: var(--text);
    font-weight: 500;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.2;
  }
  .header-scene {
    font-family: var(--font-ui);
    font-size: 0.65rem;
    color: var(--text-scene);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.2;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex-shrink: 0;
  }
  .turn-badge {
    font-family: var(--font-ui);
    font-size: 0.7rem;
    color: var(--accent);
    background: var(--accent-dim);
    padding: 0.15rem 0.5rem;
    border-radius: var(--radius-pill);
    font-feature-settings: "tnum";
    font-weight: 500;
    letter-spacing: 0.02em;
    margin-right: 0.25rem;
  }
  .hbtn {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    min-width: 34px;
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: color 0.15s;
  }
  .hbtn:hover {
    color: var(--text);
  }
  .menu-wrap {
    position: relative;
  }
  .dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
  }
  @media (min-width: 1200px) {
    .mobile-only {
      display: none;
    }
  }

  /* ── Story area ─────────────────────────────────────── */
  .story-area {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem 1.25rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0;
    visibility: hidden;
  }
  .story-area.story-ready {
    visibility: visible;
  }
  @media (min-width: 1200px) {
    .story-area {
      padding: 2rem 2.5rem 0.5rem;
    }
  }
  .opening-block {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1.25rem;
  }
  .opening-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-dim);
  }
  .opening-scene {
    font-family: var(--font-ui);
    font-size: 0.65rem;
    color: var(--text-scene);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .scene-crumb {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    color: var(--text-scene);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 1.25rem;
  }
  .turn-scene {
    font-family: var(--font-ui);
    font-size: 0.65rem;
    color: var(--text-scene);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 0.4rem;
  }
  .opening-text {
    font-family: var(--font-story);
    font-size: var(--story-size);
    line-height: var(--story-line);
    color: var(--text);
    margin-bottom: 1.5rem;
    font-style: italic;
    opacity: 0.75;
    white-space: pre-line;
  }
  .edit-turn {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }
  .edit-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-dim);
  }
  .edit-textarea {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    padding: 0.75rem;
    font-size: 0.95rem;
    font-family: var(--font-ui);
    resize: none;
    overflow: hidden;
    width: 100%;
    box-sizing: border-box;
  }
  .edit-textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .edit-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .edit-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-dim);
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    min-height: 28px;
  }
  .edit-btn:hover {
    color: var(--text);
  }
  .edit-btn.inline {
    margin-left: auto;
  }
  .delete-btn {
    background: none;
    border: 1px solid var(--accent);
    color: var(--accent);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .delete-btn:hover:not(:disabled) {
    background: var(--accent);
    color: #0d0b08;
  }
  .delete-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .delete-btn.inline {
    margin-left: 0.25rem;
  }

  /* Player action — pencil style */
  .action-inline {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    background: var(--bg-action);
    padding: 0.55rem 1rem 0.55rem 0.85rem;
    margin: 1rem -1.25rem;
    color: var(--text-action);
    font-family: var(--font-story);
    font-size: 0.92rem;
    font-style: italic;
    line-height: 1.5;
  }
  @media (min-width: 1200px) {
    .action-inline {
      margin-left: -2.5rem;
      margin-right: -2.5rem;
      padding-left: 2.5rem;
      padding-right: 2.5rem;
    }
  }
  .pencil-icon {
    flex-shrink: 0;
    color: var(--text-dim);
    opacity: 0.6;
    position: relative;
    top: 1px;
  }

  /* Narrative paragraphs */
  .narrative-block {
    margin-bottom: 1rem;
  }
  .variant-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.4rem;
    flex-wrap: wrap;
  }
  .variant-label {
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
    font-family: var(--font-ui);
  }
  .variant-pill {
    background: var(--bg-action);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    cursor: pointer;
  }
  .variant-pill:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--border-hover);
  }
  .variant-pill.active {
    background: var(--accent);
    color: #0d0b08;
    border-color: transparent;
  }
  .variant-pill:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .para {
    font-family: var(--font-story);
    font-size: var(--story-size);
    line-height: var(--story-line);
    color: var(--text);
    margin-bottom: 1em;
    white-space: pre-line;
  }
  .para:last-child {
    margin-bottom: 0;
  }
  .action-text {
    flex: 1;
    min-width: 0;
  }
  .inline-code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.95em;
    padding: 0.08em 0.28em;
    border-radius: 4px;
    border: 1px solid var(--border);
    color: var(--accent);
  }
  .inline-quote {
    padding: 0.04em 0.12em;
    border-radius: 4px;
    color: var(--accent);
    font-style: italic;
  }

  /* Fade-in animation for fresh turns */
  .fresh .para {
    animation: paraIn 0.4s ease both;
  }
  .fresh.action-inline {
    animation: paraIn 0.25s ease both;
  }
  @keyframes paraIn {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Thinking dots */
  .thinking {
    display: flex;
    gap: 5px;
    align-items: center;
    padding: 0.75rem 0 0.5rem;
  }
  .dot {
    width: 6px;
    height: 6px;
    background: var(--accent);
    border-radius: 50%;
    opacity: 0.5;
    animation: blink 1.2s infinite ease-in-out;
  }
  .dot:nth-child(2) {
    animation-delay: 0.2s;
  }
  .dot:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes blink {
    0%,
    80%,
    100% {
      opacity: 0.2;
      transform: scale(0.75);
    }
    40% {
      opacity: 0.9;
      transform: scale(1);
    }
  }

  /* ── Input zone ─────────────────────────────────────── */
  .input-zone {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }
  @media (min-width: 1200px) {
    .input-zone {
      padding-left: 1.25rem;
      padding-right: 1.25rem;
      padding-bottom: 1.1rem;
    }
  }

  /* Mode selector row */
  .mode-row {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0.35rem 0.75rem;
    border-bottom: 1px solid var(--border);
    min-height: 42px;
  }
  .mode-clear {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 1.1rem;
    min-width: 34px;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 0.15s,
      color 0.15s;
    pointer-events: none;
  }
  .mode-clear:not(:disabled) {
    opacity: 1;
    pointer-events: auto;
  }
  .mode-clear:hover {
    color: var(--text);
  }
  .mode-group {
    display: flex;
    gap: 0.35rem;
    padding: 0.15rem 0.2rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-action);
  }
  .mode-pill {
    border: none;
    background: none;
    color: var(--text-dim);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    padding: 0.3rem 0.65rem;
    border-radius: 999px;
    cursor: pointer;
    min-height: 28px;
  }
  .mode-pill:hover {
    color: var(--text);
  }
  .mode-pill.active {
    background: var(--accent);
    color: #0d0b08;
  }
  .mode-undo,
  .mode-undo-cancel,
  .mode-regen,
  .mode-impersonate {
    background: var(--bg-action);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 1rem;
    min-width: 34px;
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0.85;
    border-radius: 50%;
  }
  .mode-undo {
    margin-left: 0.35rem;
  }
  .mode-undo-cancel {
    margin-left: 0.25rem;
  }
  .mode-regen {
    margin-left: 0.25rem;
  }
  .mode-impersonate {
    margin-left: 0.25rem;
  }
  .mode-undo:hover:not(:disabled),
  .mode-undo-cancel:hover:not(:disabled),
  .mode-regen:hover:not(:disabled),
  .mode-impersonate:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--border-hover);
  }
  .mode-undo:disabled,
  .mode-undo-cancel:disabled,
  .mode-regen:disabled,
  .mode-impersonate:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
  .send-btn {
    margin-left: auto;
    background: var(--accent);
    border: none;
    color: #0d0b08;
    border-radius: 50%;
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      background 0.15s,
      opacity 0.15s;
    flex-shrink: 0;
  }
  .send-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .send-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .spin {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Textarea */
  .input-zone textarea {
    width: 100%;
    background: transparent;
    border: none;
    color: var(--text);
    font-family: var(--font-story);
    font-size: 0.95rem;
    line-height: 1.5;
    padding: 0.85rem 1.25rem 0.65rem;
    resize: none;
    display: block;
  }
  @media (min-width: 1200px) {
    .input-zone textarea {
      padding-bottom: 1.25rem;
      min-height: 68px;
    }
  }
  .input-zone textarea::placeholder {
    color: var(--text-dim);
    font-style: italic;
  }
  .input-zone textarea:focus {
    outline: none;
  }
  .input-zone textarea:disabled {
    opacity: 0.4;
  }

  /* Bottom toolbar */
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding: 0.2rem 0.5rem 0.5rem;
    border-top: 1px solid var(--border);
  }
  @media (min-width: 1200px) {
    .toolbar {
      display: none;
    }
  }
  .tbtn {
    background: none;
    border: none;
    color: var(--text-dim);
    min-width: 48px;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: color 0.15s;
    border-radius: 4px;
  }
  .tbtn:hover {
    color: var(--text);
  }

  /* Editor overlay */
  .editor-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .editor-panel {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.25rem;
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .editor-header {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .editor-header > span:first-child {
    font-family: var(--font-ui);
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .editor-hint {
    font-size: 0.75rem;
    color: var(--text-dim);
  }
  .depth-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    color: var(--text-dim);
  }
  .depth-input {
    width: 60px;
    padding: 0.3rem 0.5rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 0.82rem;
  }
  .dropdown-link {
    display: block;
    padding: 0.5rem 0.75rem;
    font-size: 0.82rem;
    color: var(--text);
    text-decoration: none;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
    white-space: nowrap;
  }
  .dropdown-link:hover {
    background: var(--bg-action);
  }
</style>
