<script lang="ts">
  import { tick } from "svelte"
  import { SvelteSet } from "svelte/reactivity"
  import type { ChatMember, ChatMessage } from "@/shared/types"
  import { chats } from "@/services/chats"
  import { stories } from "@/services/stories"
  import { subscribeStreamPreview } from "@/services/streamPreview"
  import { normalizeChatInput } from "@/utils/inputNormalize"
  import { scrollToBottom } from "@/utils/scroll"
  import { isNearBottom } from "@/utils/scrollFollow"
  import { goBack } from "@/stores/router"
  import { showConfirm, showError } from "@/stores/ui"
  import { createRequestId } from "@/utils/ids"
  import { clearPendingRequest, getPendingRequest, setPendingRequest } from "@/utils/pendingRequests"
  import { cn } from "@/utils.js"
  import {
    canUndoChatCancel,
    chatMembers,
    chatMessages,
    currentChatId,
    currentChatTitle,
    isChatGenerating,
    nextSpeakerIndex,
  } from "@/stores/chat"
  import { streamingEnabled } from "@/stores/settings"
  import {
    appendChatExchange,
    appendChatMessage,
    applyRegenerateResult,
    applyCancelResult,
    applyUndoCancelResult,
  } from "@/features/chat/actions"
  import { createStreamController } from "@/utils/streamController.svelte.js"
  import ConversationInput from "@/components/inputs/ConversationInput.svelte"
  import RichText from "@/components/rich/RichText.svelte"
  import { SquarePen, Trash } from "@lucide/svelte"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { ScrollArea } from "@/components/ui/scroll-area"
  import { Textarea } from "@/components/ui/textarea"
  import ChatTitleModal from "@/features/chat/ChatTitleModal.svelte"
  import NextSpeakerModal from "@/features/chat/NextSpeakerModal.svelte"

  type ActionMode = "do" | "say"
  const ACTION_MODES: ActionMode[] = ["do", "say"]
  const MODE_HINTS: Record<ActionMode, string> = {
    do: "What do you do?",
    say: "What do you say?",
  }

  function handleError(err: unknown, fallback: string) {
    showError(err instanceof Error ? err.message : fallback)
  }

  async function scrollLogToBottom(el: HTMLElement | null, opts?: { smooth?: boolean }) {
    await tick()
    scrollToBottom(el, opts)
  }

  async function withGeneration<T>(fn: () => Promise<T>, requestId?: string): Promise<T | undefined> {
    if ($isChatGenerating) return undefined
    isChatGenerating.set(true)
    if (requestId) stream.start(requestId)
    try {
      return await fn()
    } finally {
      isChatGenerating.set(false)
      if (requestId) stream.stop()
    }
  }

  let input = $state("")
  let actionMode = $state<ActionMode>("say")
  let logEl = $state<HTMLDivElement | null>(null)
  let editingMessageId = $state<number | null>(null)
  let editMessageContent = $state("")
  let showTitleEditor = $state(false)
  let titleDraft = $state("")
  let showSpeakerPicker = $state(false)
  let greetingApplying = $state(false)
  let greetingOptions = $state<string[]>([])
  let greetingFetchNonce = 0
  let greetingApplyNonce = 0
  let greetingIndex = $state<number>(-1)
  let lastGreetingCharId: number | null = null
  const resumeAttempted = new SvelteSet<string>()
  let streamPreviewMode = $state<"append" | "replace">("append")
  let regeneratingMessageId = $state<number | null>(null)

  let visibleMessages = $derived($chatMessages.filter((m) => m.role !== "system"))

  const stream = createStreamController({
    enabled: () => $streamingEnabled,
    subscribe: subscribeStreamPreview,
    seed: () => ({ content: "" }),
    reset: (state) => {
      state.content = ""
    },
    applyPatch: (state, patch) => {
      if (!patch || typeof patch !== "object") return
      const p = patch as Record<string, unknown>
      if (typeof p.content === "string") state.content = p.content
    },
    isNearBottom: () => isNearBottom(logEl),
    scrollToBottom: (opts) => scrollToBottom(logEl, opts),
    tick,
  })

  function lastAssistantMessageId(): number | null {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      const msg = visibleMessages[i]
      if (msg?.role === "assistant") return msg.id
    }
    return null
  }

  function participantLabel() {
    return $chatMembers.map((m) => m.name).join(" · ")
  }

  function aiMembers() {
    return $chatMembers.filter((m) => m.role === "ai").sort((a, b) => a.sort_order - b.sort_order)
  }

  function showNextSpeakerControl() {
    return aiMembers().length > 1
  }

  function nextSpeakerName() {
    const list = aiMembers()
    if (list.length === 0) return "Unknown"
    const safeIndex = $nextSpeakerIndex % list.length
    return list[safeIndex]?.name ?? "Unknown"
  }

  function handleLogScroll() {
    if (!$isChatGenerating || !$streamingEnabled) return
    stream.handleScroll()
  }

  $effect(() => {
    const el = logEl
    if (!el) return
    const onScroll = () => handleLogScroll()
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  })

  let didInitialScroll = false
  $effect(() => {
    const el = logEl
    if (!el || didInitialScroll) return
    didInitialScroll = true
    void scrollLogToBottom(el)
  })

  type PendingChatPayload = { chatId: number; content?: string }

  async function resumePendingChat(kind: "chat.send" | "chat.continue" | "chat.regenerate") {
    if (!$currentChatId || $isChatGenerating) return
    const pending = getPendingRequest<PendingChatPayload>(kind)
    if (!pending) return
    if (pending.payload.chatId !== $currentChatId) return
    if (resumeAttempted.has(pending.requestId)) return
    resumeAttempted.add(pending.requestId)

    streamPreviewMode = kind === "chat.regenerate" ? "replace" : "append"
    regeneratingMessageId = kind === "chat.regenerate" ? lastAssistantMessageId() : null
    try {
      await withGeneration(async () => {
        if (kind === "chat.send") {
          const content = pending.payload.content ?? ""
          const result = await chats.send($currentChatId, content, pending.requestId)
          appendChatExchange(result)
        } else if (kind === "chat.continue") {
          const result = await chats.continue($currentChatId, pending.requestId)
          appendChatMessage(result)
        } else {
          const result = await chats.regenerateLast($currentChatId, pending.requestId)
          applyRegenerateResult(result)
        }
        await scrollLogToBottom(logEl)
      }, pending.requestId)
    } catch (err) {
      handleError(err, "Failed to resume generation")
    } finally {
      clearPendingRequest(kind, pending.requestId)
      streamPreviewMode = "append"
      regeneratingMessageId = null
    }
  }

  $effect(() => {
    if (!$currentChatId) return
    if ($isChatGenerating) return
    void resumePendingChat("chat.send")
    void resumePendingChat("chat.continue")
    void resumePendingChat("chat.regenerate")
  })

  function startEditTitle() {
    titleDraft = $currentChatTitle
    showTitleEditor = true
  }

  function cancelEditTitle() {
    showTitleEditor = false
  }

  async function saveTitle() {
    if (!$currentChatId) return
    try {
      await chats.update($currentChatId, {
        title: titleDraft.trim(),
      })
      currentChatTitle.set(titleDraft.trim())
      showTitleEditor = false
    } catch (err) {
      handleError(err, "Failed to update chat")
    }
  }

  type SingleAiCharacter = ChatMember & { role: "ai"; member_kind: "character"; character_id: number }
  function singleAiCharacter(): SingleAiCharacter | null {
    const ai = $chatMembers.filter((m) => m.role === "ai")
    if (ai.length !== 1) return null
    const member = ai[0]
    if (!member || member.member_kind !== "character" || member.character_id == null) return null
    return member as SingleAiCharacter
  }

  function playerName() {
    return $chatMembers.find((m) => m.role === "player")?.name?.trim() || "Player"
  }

  function seededGreetingMessage() {
    const hasAnyUser = visibleMessages.some((m) => m.role === "user")
    if (hasAnyUser) return null
    const assistants = visibleMessages.filter((m) => m.role === "assistant")
    if (assistants.length !== 1) return null
    return assistants[0] ?? null
  }

  let seededGreetingMessageId = $derived(seededGreetingMessage()?.id ?? null)
  let hasSingleAiCharacter = $derived(singleAiCharacter() !== null)

  function renderGreeting(template: string) {
    const ai = singleAiCharacter()
    if (!ai) return template
    return template.replaceAll("{{user}}", playerName()).replaceAll("{{char}}", ai.name || "")
  }

  async function refreshGreetingOptions() {
    const ai = singleAiCharacter()
    if (!ai) return
    const prevCharId = lastGreetingCharId
    if (ai.character_id !== prevCharId) {
      greetingOptions = []
      greetingIndex = -1
    }
    if (ai.character_id === prevCharId && greetingOptions.length > 0) return
    lastGreetingCharId = ai.character_id

    const nonce = ++greetingFetchNonce
    try {
      const card = (await stories.getCharacterCard(ai.character_id)) as {
        spec?: unknown
        data?: { first_mes?: unknown; alternate_greetings?: unknown }
      }
      if (nonce !== greetingFetchNonce) return
      if (card.spec !== "chara_card_v2" || !card.data) return
      const first = typeof card.data.first_mes === "string" ? card.data.first_mes.trim() : ""
      const alts = Array.isArray(card.data.alternate_greetings)
        ? (card.data.alternate_greetings as unknown[])
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
        : []
      const nextOptions = [first, ...alts].filter((v) => v.trim().length > 0)
      greetingOptions = nextOptions
      const current = seededGreetingMessage()?.content?.trim() ?? ""
      const rendered = nextOptions.map((t) => renderGreeting(t).trim())
      const matchIndex = current ? rendered.findIndex((t) => t === current) : -1
      greetingIndex = matchIndex >= 0 ? matchIndex : -1
    } catch {
      if (nonce !== greetingFetchNonce) return
      greetingOptions = []
      greetingIndex = -1
    }
  }

  async function applyGreetingSelection(nextIndex: number) {
    if (!$currentChatId || $isChatGenerating || greetingApplying) return
    const target = seededGreetingMessage()
    if (!target) return
    if (nextIndex < 0) return
    const template = greetingOptions[nextIndex]
    const next = template ? renderGreeting(template).trim() : ""
    if (!next) return
    const nonce = ++greetingApplyNonce
    greetingApplying = true
    try {
      const result = await chats.updateMessage($currentChatId, target.id, next)
      if (nonce !== greetingApplyNonce) return
      chatMessages.update((list) => list.map((m) => (m.id === target.id ? result.message : m)))
      greetingIndex = nextIndex
      canUndoChatCancel.set(false)
    } catch (err) {
      handleError(err, "Failed to update greeting")
    } finally {
      if (nonce === greetingApplyNonce) greetingApplying = false
    }
  }

  function selectGreeting(nextIndex: number) {
    if (nextIndex === greetingIndex) return
    void applyGreetingSelection(nextIndex)
  }

  $effect(() => {
    const ai = singleAiCharacter()
    const target = seededGreetingMessage()
    if (!ai || !target) {
      greetingOptions = []
      greetingApplying = false
      lastGreetingCharId = null
      return
    }
    void refreshGreetingOptions()
  })

  async function setNextSpeaker(memberId: number) {
    if (!$currentChatId || $isChatGenerating) return
    try {
      const result = await chats.setNextSpeaker($currentChatId, memberId)
      nextSpeakerIndex.set(result.next_speaker_index)
      showSpeakerPicker = false
    } catch (err) {
      handleError(err, "Failed to set next speaker")
    }
  }

  async function sendMessage() {
    if (!$currentChatId || $isChatGenerating) return
    const raw = input
    const trimmed = raw.trim()
    streamPreviewMode = "append"
    regeneratingMessageId = null
    input = ""
    const requestId = createRequestId()
    try {
      await withGeneration(async () => {
        if (trimmed) {
          const content = normalizeChatInput(trimmed, actionMode)
          if (!content) return
          setPendingRequest({
            kind: "chat.send",
            requestId,
            createdAt: Date.now(),
            payload: { chatId: $currentChatId, content },
          })
          const result = await chats.send($currentChatId, content, requestId)
          appendChatExchange(result)
        } else {
          setPendingRequest({
            kind: "chat.continue",
            requestId,
            createdAt: Date.now(),
            payload: { chatId: $currentChatId },
          })
          const result = await chats.continue($currentChatId, requestId)
          appendChatMessage(result)
        }
        await scrollLogToBottom(logEl)
      }, requestId)
    } catch (err) {
      handleError(err, "Failed to send message")
    } finally {
      clearPendingRequest("chat.send", requestId)
      clearPendingRequest("chat.continue", requestId)
      streamPreviewMode = "append"
      regeneratingMessageId = null
    }
  }

  async function regenerateLast() {
    if (!$currentChatId || $isChatGenerating || visibleMessages.length === 0) return
    streamPreviewMode = "replace"
    regeneratingMessageId = lastAssistantMessageId()
    const requestId = createRequestId()
    try {
      await withGeneration(async () => {
        setPendingRequest({
          kind: "chat.regenerate",
          requestId,
          createdAt: Date.now(),
          payload: { chatId: $currentChatId },
        })
        const result = await chats.regenerateLast($currentChatId, requestId)
        applyRegenerateResult(result)
        await scrollLogToBottom(logEl)
      }, requestId)
    } catch (err) {
      handleError(err, "Failed to regenerate reply")
    } finally {
      clearPendingRequest("chat.regenerate", requestId)
      streamPreviewMode = "append"
      regeneratingMessageId = null
    }
  }

  async function cancelLastExchange() {
    if (!$currentChatId || $isChatGenerating || visibleMessages.length === 0) return
    isChatGenerating.set(true)
    try {
      const result = await chats.cancelLast($currentChatId)
      applyCancelResult(result)
    } catch (err) {
      handleError(err, "Failed to cancel last exchange")
    } finally {
      isChatGenerating.set(false)
    }
  }

  async function undoCancel() {
    if (!$currentChatId || $isChatGenerating || !$canUndoChatCancel) return
    isChatGenerating.set(true)
    try {
      const result = await chats.undoCancel($currentChatId)
      applyUndoCancelResult(result)
      await scrollLogToBottom(logEl)
    } catch (err) {
      handleError(err, "Failed to undo cancel")
    } finally {
      isChatGenerating.set(false)
    }
  }

  function startEditMessage(message: ChatMessage) {
    editingMessageId = message.id
    editMessageContent = message.content
    void scrollLogToBottom(logEl)
  }

  function cancelEditMessage() {
    editingMessageId = null
  }

  async function saveMessageEdit(messageId: number) {
    if (!$currentChatId) return
    const content = editMessageContent.trim()
    if (!content) {
      showError("Message content cannot be empty")
      return
    }
    try {
      const result = await chats.updateMessage($currentChatId, messageId, content)
      chatMessages.update((list) => list.map((m) => (m.id === messageId ? result.message : m)))
      editingMessageId = null
      canUndoChatCancel.set(false)
    } catch (err) {
      handleError(err, "Failed to update message")
    }
  }

  async function deleteMessage(messageId: number) {
    if (!$currentChatId || $isChatGenerating) return
    const confirmed = await showConfirm({
      title: "Delete message",
      message: "Delete this message? This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    })
    if (!confirmed) return
    try {
      await chats.deleteMessage($currentChatId, messageId)
      chatMessages.update((list) => list.filter((m) => m.id !== messageId))
      canUndoChatCancel.set(false)
    } catch (err) {
      handleError(err, "Failed to delete message")
    }
  }
</script>

<div class="mx-auto flex h-dvh w-full max-w-3xl flex-col">
  <header class="flex min-h-12 items-center gap-2 border-b pr-2 min-[1200px]:pr-6">
    <Button
      variant="ghost"
      size="icon"
      class="h-12 w-12 shrink-0 rounded-none border-r text-muted-foreground hover:bg-accent hover:text-foreground"
      onclick={() => goBack("home")}
      title="Return to menu"
      aria-label="Back to home"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
      </svg>
    </Button>

    <div class="flex min-w-0 flex-1 flex-col gap-0.5 py-2">
      <span class="break-words text-sm font-medium leading-snug text-foreground">{$currentChatTitle || "Chat"}</span>
      <span class="break-words text-[11px] uppercase tracking-wider text-muted-foreground/80">
        {participantLabel() || "No participants"}
      </span>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <Badge variant="secondary" class="font-mono text-xs tabular-nums">{visibleMessages.length}</Badge>
      <Button
        variant="outline"
        size="icon"
        class="h-9 w-9"
        onclick={startEditTitle}
        disabled={$isChatGenerating}
        title="Edit title"
        aria-label="Edit title"
      >
        <SquarePen size={12} strokeWidth={2} aria-hidden="true" />
      </Button>
      {#if showNextSpeakerControl()}
        <Button
          variant="outline"
          size="sm"
          class="h-9 rounded-full px-3 font-mono text-xs"
          onclick={() => (showSpeakerPicker = true)}
          title="Pick next speaker"
        >
          Next: {nextSpeakerName()}
        </Button>
      {/if}
    </div>
  </header>

  {#if showTitleEditor}
    <ChatTitleModal
      open={showTitleEditor}
      disabled={$isChatGenerating}
      bind:titleDraft
      onCancel={cancelEditTitle}
      onSave={saveTitle}
    />
  {/if}

  {#if showSpeakerPicker && showNextSpeakerControl()}
    <NextSpeakerModal
      open={showSpeakerPicker}
      disabled={$isChatGenerating}
      members={aiMembers()}
      onPick={setNextSpeaker}
      onClose={() => (showSpeakerPicker = false)}
    />
  {/if}

  <ScrollArea class="min-h-0 flex-1" bind:viewportRef={logEl}>
    <div class="px-5 pb-2 pt-6 min-[1200px]:px-10 min-[1200px]:pt-8">
      {#if visibleMessages.length === 0}
        <div
          class="grid place-items-center rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground"
        >
          No messages yet.
        </div>
      {:else}
        <div class="space-y-3">
          {#each visibleMessages as message (message.id)}
            {@const fromUser = message.role === "user"}
            <div class={cn("rounded-lg border bg-card p-4", fromUser && "border-primary/20 bg-primary/5")}>
              <div class="flex items-start justify-between gap-3">
                <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {message.speaker_name}
                </div>
                <div class="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    class="h-8 w-8"
                    onclick={() => startEditMessage(message)}
                    disabled={$isChatGenerating}
                    title="Edit message"
                    aria-label="Edit message"
                  >
                    <SquarePen size={12} strokeWidth={2} aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    class="h-8 w-8 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onclick={() => deleteMessage(message.id)}
                    disabled={$isChatGenerating}
                    title="Delete message"
                  >
                    <Trash size={12} strokeWidth={2} aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {#if editingMessageId === message.id}
                <div class="mt-3 space-y-2">
                  <Textarea bind:value={editMessageContent} rows={3} disabled={$isChatGenerating} />
                  <div class="flex items-center justify-end gap-2">
                    <Button variant="outline" onclick={cancelEditMessage} disabled={$isChatGenerating}>Cancel</Button>
                    <Button onclick={() => saveMessageEdit(message.id)} disabled={$isChatGenerating}>Save</Button>
                  </div>
                </div>
              {:else}
                <div class="mt-3 font-story text-sm leading-relaxed text-foreground">
                  {#if $isChatGenerating && streamPreviewMode === "replace" && regeneratingMessageId === message.id}
                    {#if $streamingEnabled && stream.state.content.trim().length > 0}
                      <RichText text={stream.state.content} mode="block" />
                    {:else}
                      <div class="italic text-muted-foreground">Regenerating…</div>
                    {/if}
                  {:else}
                    <RichText text={message.content} mode="block" />
                  {/if}
                </div>

                {#if !(streamPreviewMode === "replace" && $isChatGenerating && regeneratingMessageId === message.id)}
                  {#if message.id === seededGreetingMessageId && hasSingleAiCharacter && (greetingOptions.length > 1 || greetingIndex < 0)}
                    <div class="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Greeting options">
                      <span class="mr-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                        >Greetings</span
                      >
                      {#if greetingIndex < 0}
                        <Button
                          variant="secondary"
                          size="sm"
                          class="h-8 rounded-full px-3 font-mono text-xs"
                          disabled
                          title="Current greeting is custom"
                        >
                          custom
                        </Button>
                      {/if}
                      {#each greetingOptions as _, i (i)}
                        <Button
                          variant={greetingIndex === i ? "secondary" : "outline"}
                          size="sm"
                          class="h-8 w-10 rounded-full px-0 font-mono text-xs"
                          onclick={() => selectGreeting(i)}
                          disabled={$isChatGenerating || greetingApplying}
                          title={i === 0 ? "Greeting 1 (first_mes)" : `Greeting ${i + 1}`}
                        >
                          {i + 1}
                        </Button>
                      {/each}
                    </div>
                    {#if greetingApplying}
                      <div class="mt-2 text-xs text-muted-foreground" aria-live="polite">Applying greeting...</div>
                    {/if}
                  {/if}
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if $isChatGenerating && $streamingEnabled && streamPreviewMode === "append" && stream.state.content.trim().length > 0}
        <div class="mt-3 rounded-lg border border-dashed bg-card p-4">
          <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{nextSpeakerName()}</div>
          <div class="mt-3 font-story text-sm leading-relaxed text-foreground">
            <RichText text={stream.state.content} mode="block" />
          </div>
        </div>
      {/if}

      <div class="h-4"></div>
    </div>
  </ScrollArea>

  <ConversationInput
    bind:value={input}
    placeholder={`${MODE_HINTS[actionMode]} (send empty to continue)`}
    disabled={$isChatGenerating}
    canSend={true}
    sending={$isChatGenerating}
    onSend={sendMessage}
  >
    {#snippet topControls()}
      <Button
        variant="outline"
        size="icon"
        class="h-8 w-8 rounded-full"
        onclick={() => (input = "")}
        disabled={!input || $isChatGenerating}
        aria-label="Clear"
      >
        ×
      </Button>
      <div class="flex items-center gap-1 rounded-full border bg-background p-1" role="group" aria-label="Action mode">
        {#each ACTION_MODES as mode (mode)}
          <Button
            variant={actionMode === mode ? "secondary" : "ghost"}
            size="sm"
            class="h-8 rounded-full px-3"
            onclick={() => (actionMode = mode)}
            disabled={$isChatGenerating}
          >
            {mode}
          </Button>
        {/each}
      </div>
      <Button
        variant="outline"
        size="icon"
        class="h-8 w-8 rounded-full"
        onclick={cancelLastExchange}
        disabled={$isChatGenerating || visibleMessages.length === 0}
        title="Cancel last exchange"
        aria-label="Cancel last exchange"
      >
        ↶
      </Button>
      {#if $canUndoChatCancel}
        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8 rounded-full"
          onclick={undoCancel}
          disabled={$isChatGenerating}
          title="Undo cancel"
          aria-label="Undo cancel"
        >
          ↷
        </Button>
      {/if}

      <Button
        variant="outline"
        size="icon"
        class="h-8 w-8 rounded-full"
        onclick={regenerateLast}
        disabled={$isChatGenerating || visibleMessages.length === 0}
        title="Regenerate last reply"
        aria-label="Regenerate last reply"
      >
        ↻
      </Button>
    {/snippet}
  </ConversationInput>
</div>
