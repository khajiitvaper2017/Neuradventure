<script lang="ts">
  import { onMount, tick } from "svelte"
  import { api } from "../api/client.js"
  import { showError, goBack } from "../stores/ui.js"
  import {
    chatMembers,
    chatMessages,
    currentChatId,
    currentChatScenario,
    currentChatTitle,
    isChatGenerating,
    nextSpeakerIndex,
  } from "../stores/chat.js"
  import IconSend from "../components/icons/IconSend.svelte"
  import IconSpinner from "../components/icons/IconSpinner.svelte"

  let input = $state("")
  let logEl: HTMLDivElement | null = null

  function participantLabel() {
    return $chatMembers.map((m) => m.name).join(" · ")
  }

  function scrollToBottom() {
    if (!logEl) return
    logEl.scrollTop = logEl.scrollHeight
  }

  $effect(() => {
    if ($chatMessages.length === 0) return
    tick().then(scrollToBottom)
  })

  onMount(() => {
    tick().then(scrollToBottom)
  })

  async function sendMessage() {
    const content = input.trim()
    if (!content || !$currentChatId || $isChatGenerating) return
    isChatGenerating.set(true)
    input = ""
    try {
      const result = await api.chats.send($currentChatId, content)
      chatMessages.update((list) => [...list, result.player_message, result.ai_message])
      nextSpeakerIndex.set(result.next_speaker_index)
      await tick()
      scrollToBottom()
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to send message")
    } finally {
      isChatGenerating.set(false)
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }
</script>

<div class="screen chat">
  <div class="screen-header">
    <button class="back-btn" onclick={() => goBack("home")} aria-label="Back">←</button>
    <h2 class="screen-title">{$currentChatTitle || "Chat"}</h2>
  </div>

  {#if $currentChatScenario.trim()}
    <div class="chat-scenario">{$currentChatScenario}</div>
  {/if}
  <div class="chat-participants">{participantLabel()}</div>

  <div class="chat-log" bind:this={logEl} data-scroll-root="screen">
    {#if $chatMessages.length === 0}
      <div class="empty">No messages yet.</div>
    {:else}
      {#each $chatMessages as message (message.id)}
        <div class="chat-message {message.role === 'user' ? 'from-user' : 'from-ai'}">
          <div class="chat-speaker">{message.speaker_name}</div>
          <div class="chat-text">{message.content}</div>
        </div>
      {/each}
    {/if}
  </div>

  <div class="chat-input">
    <textarea
      bind:value={input}
      rows="2"
      placeholder="Type a message..."
      disabled={$isChatGenerating}
      onkeydown={handleKeydown}
    ></textarea>
    <button class="send-btn" onclick={sendMessage} disabled={$isChatGenerating || !input.trim()} aria-label="Send">
      {#if $isChatGenerating}
        <IconSpinner className="spin" size={16} strokeWidth={2.2} />
      {:else}
        <IconSend size={16} strokeWidth={2.2} />
      {/if}
    </button>
  </div>
</div>

<style>
  .chat {
    background: var(--bg);
  }

  .chat-scenario {
    padding: 0.75rem 1rem 0;
    font-size: 0.8rem;
    color: var(--text-dim);
    font-style: italic;
  }

  .chat-participants {
    padding: 0.4rem 1rem 0.75rem;
    font-size: 0.7rem;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .chat-log {
    flex: 1;
    overflow-y: auto;
    padding: 0 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .chat-message {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg-raised);
  }

  .chat-message.from-user {
    border-color: var(--accent-dim);
    background: rgba(255, 255, 255, 0.04);
  }

  .chat-speaker {
    font-size: 0.7rem;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .chat-text {
    font-size: 0.92rem;
    line-height: 1.5;
    color: var(--text);
  }

  .chat-input {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.6rem;
    padding: 0.75rem 1rem 1rem;
    border-top: 1px solid var(--border);
  }

  .chat-input textarea {
    resize: none;
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-story);
    font-size: 0.92rem;
    padding: 0.65rem 0.75rem;
    border-radius: var(--radius-sm);
    min-height: 56px;
  }

  .chat-input textarea:focus {
    outline: 1px solid var(--accent);
  }

  .send-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 999px;
    background: var(--accent);
    color: #0d0b08;
    cursor: pointer;
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
