<script lang="ts">
  import { onMount, tick } from "svelte"
  import { api, type ChatMember, type ChatMessage } from "../../api/client.js"
  import { normalizeChatInput } from "../../utils/inputNormalize.js"
  import { scrollToBottom } from "../../utils/scroll.js"
  import { showConfirm, showError, goBack } from "../../stores/ui.js"
  import {
    canUndoChatCancel,
    chatMembers,
    chatMessages,
    currentChatId,
    currentChatTitle,
    isChatGenerating,
    nextSpeakerIndex,
  } from "../../stores/chat.js"
  import { autoresize } from "../../utils/actions/autoresize.js"
  import {
    appendChatExchange,
    appendChatMessage,
    applyRegenerateResult,
    applyCancelResult,
    applyUndoCancelResult,
  } from "./actions.js"
  import ConversationInput from "../../components/ui/ConversationInput.svelte"
  import InlineTokens from "../../components/ui/InlineTokens.svelte"
  import ThinkingDots from "../../components/ui/ThinkingDots.svelte"
  import IconPencilSquare from "../../components/icons/IconPencilSquare.svelte"
  import IconTrash from "../../components/icons/IconTrash.svelte"

  type ActionMode = "do" | "say"
  const ACTION_MODES: ActionMode[] = ["do", "say"]
  const MODE_HINTS: Record<ActionMode, string> = {
    do: "What do you do?",
    say: "What do you say?",
  }

  let input = $state("")
  let actionMode = $state<ActionMode>("say")
  let logEl: HTMLDivElement | null = null
  let editingMessageId = $state<number | null>(null)
  let editMessageContent = $state("")
  let showTitleEditor = $state(false)
  let titleDraft = $state("")
  let showSpeakerPicker = $state(false)
  let showGreetingPicker = $state(false)
  let greetingLoading = $state(false)
  let greetingOptions = $state<string[]>([])
  let greetingFetchNonce = 0
  let greetingIndex = $state<number>(0)
  let lastGreetingCharId: number | null = null

  let visibleMessages = $derived($chatMessages.filter((m) => m.role !== "system"))

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

  $effect(() => {
    if (visibleMessages.length === 0) return
    tick().then(() => scrollToBottom(logEl))
  })

  onMount(() => {
    tick().then(() => scrollToBottom(logEl))
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
      await api.chats.update($currentChatId, {
        title: titleDraft.trim(),
      })
      currentChatTitle.set(titleDraft.trim())
      showTitleEditor = false
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update chat")
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

  function renderGreeting(template: string) {
    const ai = singleAiCharacter()
    if (!ai) return template
    return template.replaceAll("{{user}}", playerName()).replaceAll("{{char}}", ai.name || "")
  }

  async function refreshGreetingOptions() {
    const ai = singleAiCharacter()
    if (!ai) return
    if (ai.character_id === lastGreetingCharId && greetingOptions.length > 0) return
    lastGreetingCharId = ai.character_id

    const nonce = ++greetingFetchNonce
    greetingLoading = true
    try {
      const card = (await api.stories.getCharacterCard(ai.character_id)) as {
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
      // no stored card or invalid card
    } finally {
      if (nonce === greetingFetchNonce) greetingLoading = false
    }
  }

  async function applyGreetingSelection() {
    if (!$currentChatId || $isChatGenerating) return
    const target = seededGreetingMessage()
    if (!target) return
    if (greetingIndex < 0) {
      showGreetingPicker = false
      return
    }
    const template = greetingOptions[greetingIndex]
    const next = template ? renderGreeting(template).trim() : ""
    if (!next) return
    try {
      const result = await api.chats.updateMessage($currentChatId, target.id, next)
      chatMessages.update((list) => list.map((m) => (m.id === target.id ? result.message : m)))
      showGreetingPicker = false
      canUndoChatCancel.set(false)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update greeting")
    }
  }

  $effect(() => {
    const ai = singleAiCharacter()
    const target = seededGreetingMessage()
    if (!ai || !target) {
      greetingOptions = []
      greetingLoading = false
      showGreetingPicker = false
      lastGreetingCharId = null
      return
    }
    void refreshGreetingOptions()
  })

  async function setNextSpeaker(memberId: number) {
    if (!$currentChatId || $isChatGenerating) return
    try {
      const result = await api.chats.setNextSpeaker($currentChatId, memberId)
      nextSpeakerIndex.set(result.next_speaker_index)
      showSpeakerPicker = false
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to set next speaker")
    }
  }

  async function sendMessage() {
    if (!$currentChatId || $isChatGenerating) return
    const raw = input
    const trimmed = raw.trim()
    isChatGenerating.set(true)
    input = ""
    try {
      if (trimmed) {
        const content = normalizeChatInput(trimmed, actionMode)
        if (!content) return
        const result = await api.chats.send($currentChatId, content)
        appendChatExchange(result)
      } else {
        const result = await api.chats.continue($currentChatId)
        appendChatMessage(result)
      }
      await tick()
      scrollToBottom(logEl)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to send message")
    } finally {
      isChatGenerating.set(false)
    }
  }

  async function regenerateLast() {
    if (!$currentChatId || $isChatGenerating || visibleMessages.length === 0) return
    isChatGenerating.set(true)
    try {
      const result = await api.chats.regenerateLast($currentChatId)
      applyRegenerateResult(result)
      await tick()
      scrollToBottom(logEl)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to regenerate reply")
    } finally {
      isChatGenerating.set(false)
    }
  }

  async function cancelLastExchange() {
    if (!$currentChatId || $isChatGenerating || visibleMessages.length === 0) return
    isChatGenerating.set(true)
    try {
      const result = await api.chats.cancelLast($currentChatId)
      applyCancelResult(result)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to cancel last exchange")
    } finally {
      isChatGenerating.set(false)
    }
  }

  async function undoCancel() {
    if (!$currentChatId || $isChatGenerating || !$canUndoChatCancel) return
    isChatGenerating.set(true)
    try {
      const result = await api.chats.undoCancel($currentChatId)
      applyUndoCancelResult(result)
      await tick()
      scrollToBottom(logEl)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to undo cancel")
    } finally {
      isChatGenerating.set(false)
    }
  }

  function startEditMessage(message: ChatMessage) {
    editingMessageId = message.id
    editMessageContent = message.content
    tick().then(() => scrollToBottom(logEl))
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
      const result = await api.chats.updateMessage($currentChatId, messageId, content)
      chatMessages.update((list) => list.map((m) => (m.id === messageId ? result.message : m)))
      editingMessageId = null
      canUndoChatCancel.set(false)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update message")
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
      await api.chats.deleteMessage($currentChatId, messageId)
      chatMessages.update((list) => list.filter((m) => m.id !== messageId))
      canUndoChatCancel.set(false)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete message")
    }
  }
</script>

<div class="screen chat">
  <header>
    <button class="header-back" onclick={() => goBack("home")} title="Return to menu" aria-label="Back to home">
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
    </button>

    <div class="header-center">
      <span class="story-name">{$currentChatTitle || "Chat"}</span>
      <span class="header-scene">{participantLabel() || "No participants"}</span>
    </div>

    <div class="header-actions">
      <span class="turn-badge">{visibleMessages.length}</span>
      <button
        class="edit-btn header"
        onclick={startEditTitle}
        disabled={$isChatGenerating}
        title="Edit title"
        aria-label="Edit title"
      >
        <IconPencilSquare size={12} strokeWidth={2} />
      </button>
      {#if showNextSpeakerControl()}
        <button class="next-speaker" onclick={() => (showSpeakerPicker = true)} title="Pick next speaker">
          Next: {nextSpeakerName()}
        </button>
      {/if}
      {#if seededGreetingMessage() && singleAiCharacter() && (greetingLoading || greetingOptions.length > 0)}
        <button
          class="next-speaker"
          onclick={() => (showGreetingPicker = true)}
          disabled={greetingLoading || $isChatGenerating}
          title="Switch greeting"
        >
          Greeting
        </button>
      {/if}
    </div>
  </header>

  {#if showTitleEditor}
    <div class="editor-overlay">
      <div class="editor-panel">
        <div class="editor-header">
          <span>Chat Title</span>
          <span class="editor-hint">Rename this chat</span>
        </div>
        <label class="edit-label" for="chat-title">Title</label>
        <input id="chat-title" class="edit-input" type="text" bind:value={titleDraft} />
        <div class="edit-actions">
          <button class="btn-ghost" onclick={cancelEditTitle}>Cancel</button>
          <button class="btn-accent" onclick={saveTitle}>Save</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showSpeakerPicker && showNextSpeakerControl()}
    <div
      class="editor-overlay"
      role="button"
      tabindex="0"
      aria-label="Close speaker picker"
      onclick={(e) => {
        if (e.currentTarget !== e.target) return
        showSpeakerPicker = false
      }}
      onkeydown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          showSpeakerPicker = false
        }
      }}
    >
      <div class="editor-panel">
        <div class="editor-header">
          <span>Next Speaker</span>
          <span class="editor-hint">Choose which AI should reply next</span>
        </div>
        <div class="speaker-list">
          {#each aiMembers() as member}
            <button class="speaker-btn" onclick={() => setNextSpeaker(member.id)} disabled={$isChatGenerating}>
              {member.name}
            </button>
          {/each}
        </div>
        <div class="edit-actions">
          <button class="btn-ghost" onclick={() => (showSpeakerPicker = false)}>Close</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showGreetingPicker}
    <div
      class="editor-overlay"
      role="button"
      tabindex="0"
      aria-label="Close greeting picker"
      onclick={(e) => {
        if (e.currentTarget !== e.target) return
        showGreetingPicker = false
      }}
      onkeydown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          showGreetingPicker = false
        }
      }}
    >
      <div class="editor-panel">
        <div class="editor-header">
          <span>Greeting</span>
          <span class="editor-hint">Switch the seeded greeting before your first message</span>
        </div>

        {#if greetingLoading}
          <div class="empty">Loading greetings...</div>
        {:else if greetingOptions.length === 0}
          <div class="empty">No greetings available.</div>
        {:else}
          <label class="edit-label" for="greeting-select">Greeting</label>
          <select
            id="greeting-select"
            class="edit-input"
            value={greetingIndex}
            onchange={(e) => (greetingIndex = Number((e.target as HTMLSelectElement).value))}
            disabled={$isChatGenerating}
          >
            {#if greetingIndex === -1}
              <option value={-1}>Current (custom)</option>
            {/if}
            {#each greetingOptions as _, i}
              <option value={i}>{i === 0 ? "Greeting 1 (first_mes)" : `Greeting ${i + 1}`}</option>
            {/each}
          </select>
        {/if}

        <div class="edit-actions">
          <button class="btn-ghost" onclick={() => (showGreetingPicker = false)}>Close</button>
          <button class="btn-accent" onclick={applyGreetingSelection} disabled={$isChatGenerating || greetingIndex < 0}>
            Apply
          </button>
        </div>
      </div>
    </div>
  {/if}

  <div class="chat-log" bind:this={logEl} data-scroll-root="screen">
    {#if visibleMessages.length === 0}
      <div class="empty">No messages yet.</div>
    {:else}
      {#each visibleMessages as message (message.id)}
        <div class="chat-message {message.role === 'user' ? 'from-user' : 'from-ai'}">
          <div class="chat-speaker">
            <span>{message.speaker_name}</span>
            <span class="message-actions">
              <button
                class="edit-btn inline"
                onclick={() => startEditMessage(message)}
                disabled={$isChatGenerating}
                title="Edit message"
                aria-label="Edit message"
              >
                <IconPencilSquare size={12} strokeWidth={2} />
              </button>
              <button
                class="delete-btn inline"
                onclick={() => deleteMessage(message.id)}
                disabled={$isChatGenerating}
                title="Delete message"
              >
                <IconTrash size={12} strokeWidth={2} />
              </button>
            </span>
          </div>

          {#if editingMessageId === message.id}
            <textarea
              class="edit-textarea"
              bind:value={editMessageContent}
              rows="3"
              disabled={$isChatGenerating}
              use:autoresize={editMessageContent}
            ></textarea>
            <div class="edit-actions">
              <button class="btn-ghost" onclick={cancelEditMessage} disabled={$isChatGenerating}>Cancel</button>
              <button class="btn-accent" onclick={() => saveMessageEdit(message.id)} disabled={$isChatGenerating}>
                Save
              </button>
            </div>
          {:else}
            <div class="chat-text"><InlineTokens text={message.content} /></div>
          {/if}
        </div>
      {/each}
    {/if}

    {#if $isChatGenerating}
      <ThinkingDots />
    {/if}

    <div style="height:1rem"></div>
  </div>

  <ConversationInput
    bind:value={input}
    placeholder={`${MODE_HINTS[actionMode]} (send empty to continue)`}
    disabled={$isChatGenerating}
    canSend={true}
    sending={$isChatGenerating}
    onSend={sendMessage}
  >
    <div slot="top-controls">
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
        onclick={cancelLastExchange}
        disabled={$isChatGenerating || visibleMessages.length === 0}
        title="Cancel last exchange"
        aria-label="Cancel last exchange"
      >
        ↶
      </button>
      {#if $canUndoChatCancel}
        <button
          class="mode-undo-cancel"
          onclick={undoCancel}
          disabled={$isChatGenerating}
          title="Undo cancel"
          aria-label="Undo cancel"
        >
          ↷
        </button>
      {/if}
      <button
        class="mode-regen"
        onclick={regenerateLast}
        disabled={$isChatGenerating || visibleMessages.length === 0}
        title="Regenerate last reply"
        aria-label="Regenerate last reply"
      >
        ↻
      </button>
    </div>
  </ConversationInput>
</div>

<style>
  .chat {
    background: var(--bg);
  }

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
    letter-spacing: 0.06em;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.2;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
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
  }
  .next-speaker {
    background: var(--bg-action);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 0.72rem;
    padding: 0.35rem 0.6rem;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
  }
  .next-speaker:hover {
    color: var(--text);
    border-color: var(--border-hover);
  }
  .next-speaker:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .chat-log {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem 1.25rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  @media (min-width: 1200px) {
    .chat-log {
      padding: 2rem 2.5rem 0.5rem;
    }
  }

  .chat-message {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.7rem 0.9rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg-raised);
  }
  .chat-message.from-user {
    border-color: var(--accent-dim);
    background: rgba(255, 255, 255, 0.04);
  }
  .chat-speaker {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.7rem;
    color: var(--text-dim);
    letter-spacing: 0.06em;
  }
  .message-actions {
    display: inline-flex;
    gap: 0.3rem;
    align-items: center;
  }
  .chat-text {
    font-size: 0.92rem;
    line-height: 1.5;
    color: var(--text);
    white-space: pre-line;
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
  .edit-input {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    padding: 0.65rem 0.75rem;
    font-size: 0.95rem;
    font-family: var(--font-ui);
  }
  .edit-label {
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    color: var(--text-dim);
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .edit-btn:hover {
    color: var(--text);
  }
  .edit-btn.header {
    padding: 0.25rem 0.5rem;
    min-height: 28px;
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
    letter-spacing: 0.06em;
  }
  .editor-hint {
    font-size: 0.75rem;
    color: var(--text-dim);
  }
  .speaker-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .speaker-btn {
    background: var(--bg-action);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    text-align: left;
    cursor: pointer;
  }
  .speaker-btn:hover:not(:disabled) {
    border-color: var(--border-hover);
  }
  .speaker-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
