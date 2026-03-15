<script lang="ts">
  import { onMount } from "svelte"
  import type { StoryCharacterGroup, StoryNpcGroup } from "@/shared/api-types"
  import { stories as storiesService } from "@/services/stories"
  import { chats } from "@/services/chats"
  import { streamClient } from "@/services/stream"
  import { goBack, navigate, openCharSheetForCharacter, showError } from "@/stores/ui"
  import { resetChat } from "@/stores/chat"
  import { autoresize } from "@/utils/actions/autoresize"
  import { loadPromptHistory, savePromptHistory, removePromptHistory } from "@/utils/promptHistory"
  import { createRequestId } from "@/utils/ids"
  import { clearPendingRequest, getPendingRequest, setPendingRequest } from "@/utils/pendingRequests"
  import IconDocument from "@/components/icons/IconDocument.svelte"
  import PromptHistoryPanel from "@/components/panels/PromptHistoryPanel.svelte"
  import Select from "@/components/controls/Select.svelte"
  import { generateChatFromDescription } from "@/features/chat/actions"
  import { streamingEnabled } from "@/stores/settings"

  let title = $state("")
  let description = $state("")
  let greeting = $state("")
  let loading = $state(false)
  let submitting = $state(false)
  let generating = $state(false)
  let showPlayerDropdown = $state(false)
  let chatPromptHistory = $state<string[]>([])

  let savedCharacters = $state<StoryCharacterGroup[]>([])
  let savedNpcs = $state<StoryNpcGroup[]>([])

  let playerKey = $state<string | null>(null)
  let aiKeys = $state<string[]>([])
  let titleWasAutofilled = $state(false)

  let greetingLoading = $state(false)
  let greetingOptions = $state<string[]>([])
  let seedGreetingIndex = $state(0)
  let greetingFetchNonce = 0
  let greetingTemplateOptions = $derived(
    greetingOptions.map((_, i) => ({
      value: i,
      label: i === 0 ? "Greeting 1 (first_mes)" : `Greeting ${i + 1}`,
    })),
  )

  const CHAT_PROMPT_HISTORY_KEY = "na:prompt_history:chat"

  type PlayableOption = {
    key: string
    kind: "character" | "npc"
    name: string
    character_id: number | null
    state: Omit<StoryCharacterGroup["character"], "inventory"> | Omit<StoryNpcGroup["npc"], "inventory">
    description: string
  }

  onMount(() => {
    resetChat()
    void loadOptions()
    void loadPromptHistory(CHAT_PROMPT_HISTORY_KEY).then((items) => {
      chatPromptHistory = items
    })
    const pending = getPendingRequest<{ prompt: string }>("generate.chat")
    if (pending && pending.payload.prompt?.trim()) {
      if (!description.trim()) description = pending.payload.prompt
      void runGenerateFromDescription(pending.payload.prompt, pending.requestId)
    }
  })

  async function loadOptions() {
    loading = true
    try {
      const [chars, npcs] = await Promise.all([storiesService.characters(), storiesService.npcs()])
      savedCharacters = chars
      savedNpcs = npcs
    } catch {
      showError("Failed to load characters")
    } finally {
      loading = false
    }
  }

  function refreshPlayable() {
    void loadOptions()
  }

  function useChatPrompt(value: string) {
    description = value
  }

  function deleteChatPrompt(value: string) {
    void removePromptHistory(CHAT_PROMPT_HISTORY_KEY, value).then((items) => {
      chatPromptHistory = items
    })
  }

  type StoryRef = { id: number; title: string; updated_at: string }
  function formatStoryLabel(stories: StoryRef[]): string {
    if (!stories || stories.length === 0) return "No story yet"
    const sorted = [...stories].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    const titles = sorted.map((s) => s.title).filter(Boolean)
    const shown = titles.slice(0, 2)
    const extra = titles.length - shown.length
    if (shown.length === 0) return "No story yet"
    return extra > 0 ? `${shown.join(", ")} +${extra} more` : shown.join(", ")
  }

  let playableOptions = $derived([
    ...savedCharacters.map((c) => ({
      key: `char_${c.id}`,
      kind: "character" as const,
      name: c.character.name,
      character_id: c.id,
      state: c.character,
      description: `${c.character.race || "Unknown"} · ${c.character.gender || "Unknown"} · ${formatStoryLabel(
        c.stories,
      )}`,
    })),
    ...savedNpcs.map((n) => ({
      key: n.key,
      kind: "npc" as const,
      name: n.npc.name,
      character_id: null,
      state: n.npc,
      description: `${n.npc.race || "Unknown"} · ${n.npc.gender || "Unknown"} · ${formatStoryLabel(n.stories)}`,
    })),
  ])

  function optionByKey(key: string | null): PlayableOption | null {
    if (!key) return null
    return playableOptions.find((o) => o.key === key) ?? null
  }

  let hasPlayableOptions = $derived(playableOptions.length > 0)

  function togglePlayerDropdown() {
    if (loading || !hasPlayableOptions) return
    showPlayerDropdown = !showPlayerDropdown
  }

  function selectPlayer(key: string) {
    playerKey = key
    aiKeys = aiKeys.filter((k) => k !== key)
    showPlayerDropdown = false
    maybeAutofillTitle()
    void refreshGreeting()
  }

  function toggleAi(key: string) {
    if (key === playerKey) return
    if (aiKeys.includes(key)) {
      aiKeys = aiKeys.filter((k) => k !== key)
      maybeAutofillTitle()
      void refreshGreeting()
      return
    }
    aiKeys = [...aiKeys, key]
    maybeAutofillTitle()
    void refreshGreeting()
  }

  function formatNameList(names: string[]): string {
    const cleaned = names.map((n) => n.trim()).filter(Boolean)
    if (cleaned.length <= 1) return cleaned[0] ?? ""
    if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`
    return `${cleaned.slice(0, -1).join(", ")} and ${cleaned[cleaned.length - 1]}`
  }

  function maybeAutofillTitle() {
    if (!playerKey) {
      if (titleWasAutofilled) title = ""
      return
    }
    const player = optionByKey(playerKey)
    const aiMembers = aiKeys.map((k) => optionByKey(k)).filter((entry): entry is PlayableOption => !!entry)
    if (!player || aiMembers.length === 0) {
      if (titleWasAutofilled) title = ""
      return
    }

    if (title.trim() && !titleWasAutofilled) return
    title = formatNameList([player.name, ...aiMembers.map((m) => m.name)])
    titleWasAutofilled = true
  }

  let canSubmit = $derived(
    !!title.trim() && !!greeting.trim() && !!playerKey && aiKeys.length > 0 && !submitting && !generating,
  )
  let canGenerate = $derived(!!description.trim() && !generating)

  let selectedPlayerOption = $derived(optionByKey(playerKey))
  let selectedPlayerCharId = $derived(selectedPlayerOption?.character_id ?? null)
  let selectedPlayerLabel = $derived(
    selectedPlayerOption ? `${selectedPlayerOption.name} — ${selectedPlayerOption.description}` : "Select a character",
  )
  let selectedAiOptions = $derived(
    aiKeys.map((key) => optionByKey(key)).filter((entry): entry is PlayableOption => !!entry),
  )

  async function refreshGreeting() {
    greetingOptions = []
    seedGreetingIndex = 0

    if (aiKeys.length !== 1) return
    const ai = optionByKey(aiKeys[0])
    if (!ai || ai.kind !== "character" || !ai.character_id) return

    const nonce = ++greetingFetchNonce
    greetingLoading = true
    try {
      const card = (await storiesService.getCharacterCard(ai.character_id)) as {
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
      const greetings = [first, ...alts].filter((v) => v.trim().length > 0)
      greetingOptions = greetings
      seedGreetingIndex = 0
      if (!greeting.trim() && greetings[0]) greeting = greetings[0]
    } catch {
      // no stored card or invalid card
    } finally {
      if (nonce === greetingFetchNonce) greetingLoading = false
    }
  }

  async function runGenerateFromDescription(prompt: string, requestId: string) {
    if (generating) return
    const trimmed = prompt.trim()
    if (!trimmed) return
    generating = true
    setPendingRequest({ kind: "generate.chat", requestId, createdAt: Date.now(), payload: { prompt: trimmed } })
    const unsub = $streamingEnabled
      ? streamClient.subscribe(requestId, (msg) => {
          const patch =
            msg.type === "subscribed"
              ? ((msg.snapshot ?? {}) as Record<string, unknown>)
              : msg.type === "stream" && msg.event === "preview"
                ? (msg.patch as Record<string, unknown>)
                : null
          if (!patch) return
          if (typeof patch.title === "string") {
            title = patch.title
            titleWasAutofilled = false
          }
          if (typeof patch.greeting === "string") greeting = patch.greeting
        })
      : null
    try {
      chatPromptHistory = await savePromptHistory(CHAT_PROMPT_HISTORY_KEY, trimmed)
      const result = await generateChatFromDescription(trimmed, requestId)
      title = result.title
      titleWasAutofilled = false
      greeting = result.greeting
    } catch (err) {
      showError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      clearPendingRequest("generate.chat", requestId)
      generating = false
      unsub?.()
    }
  }

  async function generateFromDescription() {
    const prompt = description.trim()
    if (!prompt) {
      showError("Description is required")
      return
    }
    const requestId = createRequestId()
    await runGenerateFromDescription(prompt, requestId)
  }

  async function startChat() {
    if (!playerKey) {
      showError("Select a player character")
      return
    }
    if (aiKeys.length === 0) {
      showError("Select at least one AI member")
      return
    }
    const player = optionByKey(playerKey)
    if (!player) {
      showError("Invalid player selection")
      return
    }

    const aiMembers = aiKeys.map((key) => optionByKey(key)).filter((entry): entry is PlayableOption => !!entry)

    if (aiMembers.length === 0) {
      showError("Select at least one AI member")
      return
    }
    if (!title.trim()) {
      showError("Title is required")
      return
    }
    if (!greeting.trim()) {
      showError("Greeting is required")
      return
    }

    submitting = true
    try {
      const members = [
        {
          role: "player" as const,
          member_kind: player.kind,
          character_id: player.character_id,
          state: player.state,
        },
        ...aiMembers.map((member) => ({
          role: "ai" as const,
          member_kind: member.kind,
          character_id: member.character_id,
          state: member.state,
        })),
      ]

      const seedGreeting = {
        speaker_sort_order: 1,
        content: greeting.trim(),
      }

      const { id } = await chats.create({
        title: title.trim(),
        members,
        ...(seedGreeting ? { seed_greeting: seedGreeting } : {}),
      })
      navigate("chat", { reset: true, params: { chatId: id } })
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to create chat")
    } finally {
      submitting = false
    }
  }
</script>

<svelte:window on:click={() => (showPlayerDropdown = false)} />

<div class="screen new-chat">
  <header class="screen-header">
    <button class="back-btn" onclick={() => goBack("home")} aria-label="Back">←</button>
    <h2 class="screen-title">New Chat</h2>
  </header>

  <div class="form-scroll" data-scroll-root="screen">
    <div class="field generate-field">
      <label for="chat-generate">Generate from Description</label>
      <div class="generate-row">
        <textarea
          id="chat-generate"
          bind:value={description}
          placeholder="e.g. a tense council meeting in a storm-battered keep"
          rows="2"
          use:autoresize={description}
        ></textarea>
        <button class="btn-ghost generate-btn" onclick={generateFromDescription} disabled={!canGenerate}>
          {generating ? "Generating..." : "✦ Generate"}
        </button>
      </div>
      <PromptHistoryPanel items={chatPromptHistory} onUse={useChatPrompt} onDelete={deleteChatPrompt} />
    </div>

    <div class="field">
      <label for="chat-title">Title</label>
      <input
        id="chat-title"
        type="text"
        bind:value={title}
        placeholder="e.g. Fireside Council"
        oninput={() => (titleWasAutofilled = false)}
      />
    </div>

    {#if greetingLoading}
      <div class="field">
        <div class="empty">Loading character greetings...</div>
      </div>
    {:else if greetingOptions.length > 0}
      <div class="field">
        <label for="greeting-template-select">Greeting Template (SillyTavern)</label>
        <Select
          id="greeting-template-select"
          width="100%"
          value={seedGreetingIndex}
          options={greetingTemplateOptions}
          ariaLabel="Greeting template"
          onChange={(next: number) => {
            seedGreetingIndex = Number(next)
            greeting = greetingOptions[seedGreetingIndex] ?? greeting
          }}
        />
        <div class="help-text">Selecting a template fills the greeting text below.</div>
      </div>
    {/if}

    <div class="field">
      <label for="chat-greeting">Greeting</label>
      <textarea
        id="chat-greeting"
        rows="4"
        bind:value={greeting}
        placeholder="Seeds the first AI message to start the chat."
        use:autoresize={greeting}
      ></textarea>
      <div class="help-text">Supports placeholders: {"{{user}}"} (player), {"{{char}}"} (AI speaker).</div>
    </div>

    <div class="field">
      <label for="saved-player">Use Character From Stories</label>
      <div class="shared-select-row">
        <div class="shared-select-wrap">
          <button
            id="saved-player"
            class="shared-select-btn"
            onclick={(e) => {
              e.stopPropagation()
              togglePlayerDropdown()
            }}
            disabled={generating || submitting || loading || !hasPlayableOptions}
            aria-haspopup="listbox"
            aria-expanded={showPlayerDropdown}
          >
            <span
              >{loading
                ? "Loading characters..."
                : !hasPlayableOptions
                  ? "No characters yet"
                  : selectedPlayerLabel}</span
            >
            <span class="shared-select-caret"></span>
          </button>
          {#if showPlayerDropdown}
            <div class="shared-select-menu" role="listbox" tabindex="-1">
              {#each playableOptions as option (option.key)}
                <div class="shared-select-item-row">
                  <button
                    class="shared-select-item"
                    role="option"
                    aria-selected={playerKey === option.key}
                    onclick={(e) => {
                      e.stopPropagation()
                      selectPlayer(option.key)
                    }}
                    disabled={generating || submitting}
                  >
                    <span class="shared-select-name">
                      {option.name}
                      {option.kind === "npc" ? " (NPC)" : ""}
                    </span>
                    <span class="shared-select-meta">{option.description}</span>
                  </button>
                  {#if option.kind === "character" && option.character_id}
                    <button
                      class="shared-select-item-action"
                      title="Details"
                      aria-label="Character details"
                      disabled={generating || submitting}
                      onclick={(e) => {
                        e.stopPropagation()
                        showPlayerDropdown = false
                        openCharSheetForCharacter(option.character_id)
                      }}
                    >
                      <IconDocument size={16} strokeWidth={1.6} />
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
        <button class="btn-ghost" onclick={() => navigate("char-create")} disabled={generating || submitting}
          >New</button
        >
        <button
          class="btn-ghost btn-icon"
          onclick={() => {
            if (!selectedPlayerCharId) return
            showPlayerDropdown = false
            openCharSheetForCharacter(selectedPlayerCharId)
          }}
          disabled={generating || submitting || !selectedPlayerCharId}
          title={selectedPlayerCharId ? "Character details" : "Details available for story characters only"}
        >
          <IconDocument size={16} strokeWidth={1.6} />
          Details
        </button>
        <button class="btn-ghost" onclick={refreshPlayable} disabled={generating || submitting || loading}
          >Refresh</button
        >
      </div>
    </div>

    {#if selectedPlayerOption}
      <div class="shared-summary shared-summary--tight">
        <div class="shared-summary__header">Player Character</div>
        <div class="shared-summary__name shared-summary__name--lg">{selectedPlayerOption.name}</div>
        <div class="shared-summary__details">
          {selectedPlayerOption.state.gender || "Unknown"} ·
          {[
            ...selectedPlayerOption.state.personality_traits,
            ...selectedPlayerOption.state.quirks,
            ...selectedPlayerOption.state.perks,
          ].join(", ") || "No traits"}
        </div>
      </div>
    {:else}
      <div class="shared-summary shared-summary--empty">
        <div class="shared-summary__header">Player Character</div>
        <div class="shared-summary__details">No player selected yet.</div>
        <button class="btn-accent small" onclick={() => navigate("char-create")} disabled={generating || submitting}>
          New Character
        </button>
      </div>
    {/if}

    <div class="field">
      <div class="section-label">AI Members</div>
      {#if loading}
        <div class="empty">Loading characters...</div>
      {:else if playableOptions.length === 0}
        <div class="empty">No characters available yet.</div>
      {:else}
        <div class="ai-list">
          {#each playableOptions as option (option.key)}
            <label class="surface ai-row {option.key === playerKey ? 'disabled' : ''}">
              <input
                type="checkbox"
                disabled={generating || submitting || option.key === playerKey}
                checked={aiKeys.includes(option.key)}
                onchange={() => toggleAi(option.key)}
              />
              <span class="ai-info">
                <span class="ai-name">
                  {option.name}
                  {option.kind === "npc" ? " (NPC)" : ""}
                </span>
                <span class="ai-meta">{option.description}</span>
              </span>
              {#if option.kind === "character" && option.character_id}
                <button
                  class="shared-select-item-action ai-expand"
                  title="Details"
                  aria-label="Character details"
                  disabled={generating || submitting}
                  onclick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    openCharSheetForCharacter(option.character_id)
                  }}
                >
                  <IconDocument size={16} strokeWidth={1.6} />
                </button>
              {/if}
            </label>
          {/each}
        </div>
      {/if}
      {#if playerKey && aiKeys.length === 0}
        <div class="help-text">Select at least one AI member.</div>
      {/if}
    </div>

    {#if selectedAiOptions.length > 0}
      <div class="shared-summary shared-summary--roomy">
        <div class="shared-summary__header">AI Members</div>
        <div class="shared-summary__list">
          {#each selectedAiOptions as member (member.key)}
            <div class="shared-card">
              <div class="shared-summary__name">{member.name}</div>
              <div class="shared-summary__details">
                {member.state.race || "Unknown"} · {member.state.gender || "Unknown"}
              </div>
              <div class="shared-summary__details">
                {[...member.state.personality_traits, ...member.state.quirks, ...member.state.perks].join(", ") ||
                  "No traits"}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <div class="actions">
    <button class="btn-accent full" onclick={startChat} disabled={!canSubmit}>
      {submitting ? "Creating..." : "Start Chat →"}
    </button>
  </div>
</div>

<style>
  .new-chat {
    background: var(--bg);
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .ai-list {
    display: grid;
    gap: 0.35rem;
  }
  .ai-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.6rem;
    align-items: center;
    padding: 0.45rem 0.6rem;
    cursor: pointer;
  }
  .ai-row input {
    margin: 0.15rem 0 0;
  }
  .ai-row.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .ai-row.disabled input {
    cursor: not-allowed;
  }
  .ai-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .ai-expand {
    margin: 0;
    min-width: 36px;
    min-height: 36px;
  }
  .ai-name {
    font-size: 0.9rem;
    color: var(--text);
  }
  .ai-meta {
    font-size: 0.75rem;
    color: var(--text-dim);
  }
</style>
