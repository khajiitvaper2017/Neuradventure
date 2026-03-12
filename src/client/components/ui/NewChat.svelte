<script lang="ts">
  import { onMount } from "svelte"
  import { api, type StoryCharacterGroup, type StoryNpcGroup } from "../../api/client.js"
  import { goBack, navigate, showError } from "../../stores/ui.js"
  import { resetChat } from "../../stores/chat.js"
  import { autoresize } from "../../utils/actions/autoresize.js"
  import { loadPromptHistory, savePromptHistory, removePromptHistory } from "../../utils/promptHistory.js"
  import IconTrash from "../icons/IconTrash.svelte"

  let title = $state("")
  let scenario = $state("")
  let description = $state("")
  let loading = $state(false)
  let submitting = $state(false)
  let generating = $state(false)
  let showPlayerDropdown = $state(false)
  let chatPromptHistory = $state<string[]>([])

  let savedCharacters = $state<StoryCharacterGroup[]>([])
  let savedNpcs = $state<StoryNpcGroup[]>([])

  let playerKey = $state<string | null>(null)
  let aiKeys = $state<string[]>([])

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
  }

  function toggleAi(key: string) {
    if (key === playerKey) return
    if (aiKeys.includes(key)) {
      aiKeys = aiKeys.filter((k) => k !== key)
      return
    }
    aiKeys = [...aiKeys, key]
  }

  let canSubmit = $derived(!!playerKey && aiKeys.length > 0 && !submitting)
  let canGenerate = $derived(!!description.trim() && !generating)

  let selectedPlayerOption = $derived(optionByKey(playerKey))
  let selectedPlayerLabel = $derived(
    selectedPlayerOption ? `${selectedPlayerOption.name} — ${selectedPlayerOption.description}` : "Select a character",
  )
  let selectedAiOptions = $derived(
    aiKeys.map((key) => optionByKey(key)).filter((entry): entry is PlayableOption => !!entry),
  )

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
      const result = await api.generate.chat(prompt)
      title = result.title
      scenario = result.scenario
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

      const { id } = await api.chats.create({
        title: title.trim() || undefined,
        scenario: scenario.trim() || undefined,
        members,
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
      {#if chatPromptHistory.length > 0}
        <div class="prompt-history">
          <div class="prompt-history-label">Recent prompts</div>
          <div class="prompt-history-list">
            {#each chatPromptHistory.slice(0, 6) as item}
              <div class="prompt-history-item">
                <button class="prompt-history-use" onclick={() => useChatPrompt(item)} title={item}>
                  {item}
                </button>
                <button
                  class="prompt-history-delete"
                  type="button"
                  onclick={() => deleteChatPrompt(item)}
                  aria-label="Delete prompt"
                  title="Delete prompt"
                >
                  <IconTrash size={12} strokeWidth={2} className="prompt-history-trash" />
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <div class="field">
      <label for="chat-title">Title (optional)</label>
      <input id="chat-title" class="text-input" type="text" bind:value={title} placeholder="e.g. Fireside Council" />
    </div>

    <div class="field">
      <label for="chat-scenario">Scenario (optional)</label>
      <textarea
        id="chat-scenario"
        class="text-input"
        rows="3"
        bind:value={scenario}
        placeholder="Describe the chat setup or shared context."
      ></textarea>
    </div>

    <div class="field">
      <label for="saved-player">Use Character From Stories</label>
      <div class="saved-row">
        <div class="saved-select-wrap">
          <button
            id="saved-player"
            class="saved-select-btn"
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
            <span class="saved-caret"></span>
          </button>
          {#if showPlayerDropdown}
            <div class="saved-select-menu" role="listbox" tabindex="-1">
              {#each playableOptions as option}
                <button
                  class="saved-select-item"
                  role="option"
                  aria-selected={playerKey === option.key}
                  onclick={(e) => {
                    e.stopPropagation()
                    selectPlayer(option.key)
                  }}
                >
                  <span class="saved-select-name">
                    {option.name}
                    {option.kind === "npc" ? " (NPC)" : ""}
                  </span>
                  <span class="saved-select-meta">{option.description}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <button class="btn-ghost" onclick={() => navigate("char-create")}>New</button>
        <button class="btn-ghost" onclick={refreshPlayable} disabled={loading}>Refresh</button>
      </div>
    </div>

    {#if selectedPlayerOption}
      <div class="char-summary">
        <div class="char-summary-header">Player Character</div>
        <div class="char-name">{selectedPlayerOption.name}</div>
        <div class="char-details">
          {selectedPlayerOption.state.gender || "Unknown"} ·
          {[
            ...selectedPlayerOption.state.personality_traits,
            ...selectedPlayerOption.state.quirks,
            ...selectedPlayerOption.state.perks,
          ].join(", ") || "No traits"}
        </div>
      </div>
    {:else}
      <div class="char-summary is-empty">
        <div class="char-summary-header">Player Character</div>
        <div class="char-details">No player selected yet.</div>
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
            </label>
          {/each}
        </div>
      {/if}
      {#if playerKey && aiKeys.length === 0}
        <div class="hint">Select at least one AI member.</div>
      {/if}
    </div>

    {#if selectedAiOptions.length > 0}
      <div class="npc-summary">
        <div class="npc-summary-header">AI Members</div>
        <div class="npc-list">
          {#each selectedAiOptions as member}
            <div class="npc-card">
              <div class="npc-name">{member.name}</div>
              <div class="npc-details">
                {member.state.race || "Unknown"} · {member.state.gender || "Unknown"}
              </div>
              <div class="npc-traits">
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

  .prompt-history {
    margin-top: 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .prompt-history-label {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }
  .prompt-history-list {
    display: grid;
    gap: 0.35rem;
  }
  .prompt-history-item {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }
  .prompt-history-use {
    flex: 1;
    min-width: 0;
    text-align: left;
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.45rem 0.6rem;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .prompt-history-use:hover {
    border-color: var(--accent);
  }
  .prompt-history-delete {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    border-radius: 4px;
    padding: 0.35rem 0.5rem;
    font-size: 0.8rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .prompt-history-delete:hover {
    border-color: var(--accent);
    color: var(--text);
  }

  .saved-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .saved-select-wrap {
    position: relative;
    flex: 1;
  }
  .saved-select-btn {
    width: 100%;
    flex: 1;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    padding: 0.6rem 0.75rem;
    padding-right: 2rem;
    font-size: 0.95rem;
    font-family: var(--font-ui);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    cursor: pointer;
  }
  .saved-select-btn:focus {
    outline: none;
    border-color: var(--accent);
  }
  .saved-select-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .saved-caret {
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 6px solid var(--text-dim);
  }
  .saved-select-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    z-index: 20;
    max-height: 220px;
    overflow-y: auto;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
  }
  .saved-select-item {
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: var(--text);
    font-family: var(--font-ui);
    font-size: 0.95rem;
    padding: 0.55rem 0.75rem;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .saved-select-item:hover {
    background: var(--bg-action);
  }
  .saved-select-name {
    font-size: 0.95rem;
    color: var(--text);
  }
  .saved-select-meta {
    font-size: 0.75rem;
    color: var(--text-dim);
  }

  .char-summary {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .char-summary.is-empty {
    gap: 0.6rem;
  }
  .char-summary .small {
    align-self: flex-start;
    margin-top: 0.5rem;
  }
  .char-summary-header {
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }
  .char-name {
    font-size: 1.1rem;
    font-family: var(--font-story);
    color: var(--text);
  }
  .char-details {
    font-size: 0.85rem;
    color: var(--text-dim);
  }

  .ai-list {
    display: grid;
    gap: 0.35rem;
  }
  .ai-row {
    display: grid;
    grid-template-columns: auto 1fr;
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
  .ai-name {
    font-size: 0.9rem;
    color: var(--text);
  }
  .ai-meta {
    font-size: 0.75rem;
    color: var(--text-dim);
  }

  .npc-summary {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .npc-summary-header {
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }
  .npc-list {
    display: grid;
    gap: 0.75rem;
  }
  .npc-card {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .npc-name {
    font-size: 1rem;
    font-family: var(--font-story);
    color: var(--text);
  }
  .npc-details,
  .npc-traits {
    font-size: 0.85rem;
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
