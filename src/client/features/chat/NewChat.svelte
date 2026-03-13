<script lang="ts">
  import { onMount } from "svelte"
  import { api, type StoryCharacterGroup, type StoryNpcGroup } from "../../api/client.js"
  import { goBack, navigate, openCharSheetForCharacter, showError } from "../../stores/ui.js"
  import { resetChat } from "../../stores/chat.js"
  import { autoresize } from "../../utils/actions/autoresize.js"
  import { loadPromptHistory, savePromptHistory, removePromptHistory } from "../../utils/promptHistory.js"
  import IconDocument from "../../components/icons/IconDocument.svelte"
  import PromptHistoryPanel from "../../components/ui/PromptHistoryPanel.svelte"
  import { generateChatFromDescription } from "./actions.js"

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

  let greetingLoading = $state(false)
  let greetingOptions = $state<string[]>([])
  let seedGreetingEnabled = $state(false)
  let seedGreetingIndex = $state(0)
  let greetingFetchNonce = 0
  let seedGreetingManual = false

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
    chatPromptHistory = loadPromptHistory(CHAT_PROMPT_HISTORY_KEY)
  })

  $effect(() => {
    if (seedGreetingManual) return
    seedGreetingEnabled = greeting.trim().length > 0
  })

  async function loadOptions() {
    loading = true
    try {
      const [chars, npcs] = await Promise.all([api.stories.characters(), api.stories.npcs()])
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
    chatPromptHistory = removePromptHistory(CHAT_PROMPT_HISTORY_KEY, value)
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
    void refreshGreeting()
  }

  function toggleAi(key: string) {
    if (key === playerKey) return
    if (aiKeys.includes(key)) {
      aiKeys = aiKeys.filter((k) => k !== key)
      void refreshGreeting()
      return
    }
    aiKeys = [...aiKeys, key]
    void refreshGreeting()
  }

  let canSubmit = $derived(!!playerKey && aiKeys.length > 0 && !submitting)
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
      const greetings = [first, ...alts].filter((v) => v.trim().length > 0)
      greetingOptions = greetings
      seedGreetingIndex = 0
      if (!greeting.trim() && greetings[0]) greeting = greetings[0]
      if (!seedGreetingManual) seedGreetingEnabled = greeting.trim().length > 0 || greetings.length > 0
    } catch {
      // no stored card or invalid card
    } finally {
      if (nonce === greetingFetchNonce) greetingLoading = false
    }
  }

  async function generateFromDescription() {
    if (generating) return
    const prompt = description.trim()
    if (!prompt) {
      showError("Description is required")
      return
    }
    generating = true
    try {
      chatPromptHistory = savePromptHistory(CHAT_PROMPT_HISTORY_KEY, prompt)
      const result = await generateChatFromDescription(prompt)
      title = result.title
      greeting = result.greeting
      if (!seedGreetingManual) seedGreetingEnabled = greeting.trim().length > 0
    } catch (err) {
      showError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      generating = false
    }
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

      const seedGreeting =
        seedGreetingEnabled && greeting.trim()
          ? {
              speaker_sort_order: 1,
              content: greeting,
            }
          : undefined

      const { id } = await api.chats.create({
        title: title.trim() || undefined,
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
      <label for="chat-title">Title (optional)</label>
      <input id="chat-title" class="text-input" type="text" bind:value={title} placeholder="e.g. Fireside Council" />
    </div>

    {#if greetingLoading}
      <div class="field">
        <div class="empty">Loading character greetings...</div>
      </div>
    {:else if greetingOptions.length > 0}
      <div class="field">
        <label for="greeting-template-select">Greeting Template (SillyTavern)</label>
        <select
          id="greeting-template-select"
          class="text-input"
          value={seedGreetingIndex}
          onchange={(e) => {
            seedGreetingIndex = Number((e.target as HTMLSelectElement).value)
            greeting = greetingOptions[seedGreetingIndex] ?? greeting
            if (!seedGreetingManual) seedGreetingEnabled = greeting.trim().length > 0
          }}
        >
          {#each greetingOptions as _, i}
            <option value={i}>{i === 0 ? "Greeting 1 (first_mes)" : `Greeting ${i + 1}`}</option>
          {/each}
        </select>
        <div class="hint">Selecting a template fills the greeting text below.</div>
      </div>
    {/if}

    <div class="field">
      <label for="chat-greeting">Greeting (optional)</label>
      <textarea
        id="chat-greeting"
        class="text-input"
        rows="4"
        bind:value={greeting}
        placeholder="Optional: seed the first AI message to start the chat."
        use:autoresize={greeting}
      ></textarea>
      <div class="hint">Supports placeholders: {"{{user}}"} (player), {"{{char}}"} (AI speaker).</div>
    </div>

    <div class="field">
      <div class="field-label">Seed Greeting</div>
      <div class="field-row">
        <button
          class="toggle {seedGreetingEnabled ? 'active' : ''}"
          onclick={() => {
            seedGreetingManual = true
            seedGreetingEnabled = !seedGreetingEnabled
          }}
        >
          {seedGreetingEnabled ? "On" : "Off"}
        </button>
        <div class="hint">
          {seedGreetingEnabled ? "Adds the greeting as the first AI message." : "Starts with no greeting."}
        </div>
      </div>
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
            disabled={loading || !hasPlayableOptions}
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
              {#each playableOptions as option}
                <div class="shared-select-item-row">
                  <button
                    class="shared-select-item"
                    role="option"
                    aria-selected={playerKey === option.key}
                    onclick={(e) => {
                      e.stopPropagation()
                      selectPlayer(option.key)
                    }}
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
        <button class="btn-ghost" onclick={() => navigate("char-create")}>New</button>
        <button
          class="btn-ghost btn-icon"
          onclick={() => {
            if (!selectedPlayerCharId) return
            showPlayerDropdown = false
            openCharSheetForCharacter(selectedPlayerCharId)
          }}
          disabled={!selectedPlayerCharId}
          title={selectedPlayerCharId ? "Character details" : "Details available for story characters only"}
        >
          <IconDocument size={16} strokeWidth={1.6} />
          Details
        </button>
        <button class="btn-ghost" onclick={refreshPlayable} disabled={loading}>Refresh</button>
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
        <button class="btn-accent small" onclick={() => navigate("char-create")}>New Character</button>
      </div>
    {/if}

    <div class="field">
      <div class="field-label">AI Members</div>
      {#if loading}
        <div class="empty">Loading characters...</div>
      {:else if playableOptions.length === 0}
        <div class="empty">No characters available yet.</div>
      {:else}
        <div class="ai-list">
          {#each playableOptions as option}
            <label class="ai-row {option.key === playerKey ? 'disabled' : ''}">
              <input
                type="checkbox"
                disabled={option.key === playerKey}
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
        <div class="hint">Select at least one AI member.</div>
      {/if}
    </div>

    {#if selectedAiOptions.length > 0}
      <div class="shared-summary shared-summary--roomy">
        <div class="shared-summary__header">AI Members</div>
        <div class="shared-summary__list">
          {#each selectedAiOptions as member}
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

  .text-input {
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.6rem 0.75rem;
    border-radius: var(--radius-sm);
    font-family: var(--font-story);
    font-size: 0.9rem;
  }

  .text-input:focus {
    outline: 1px solid var(--accent);
  }

  .field-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text);
  }

  .hint {
    font-size: 0.75rem;
    color: var(--text-dim);
  }

  .generate-field textarea {
    width: 100%;
    min-height: 60px;
    resize: none;
  }

  .generate-row {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .generate-btn {
    min-height: 44px;
    white-space: nowrap;
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
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-raised);
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

  @media (max-width: 680px) {
    .generate-row {
      flex-direction: column;
    }
    .generate-btn {
      width: 100%;
    }
  }
</style>
