<script lang="ts">
  import { onMount } from "svelte"
  import { api, type StoryMeta, type StoryCharacterGroup } from "../api/client.js"
  import { navigate, showError, showConfirm } from "../stores/ui.js"
  import { theme } from "../stores/settings.js"
  import IconDots from "../icons/IconDots.svelte"
  import IconGear from "../icons/IconGear.svelte"
  import IconPlus from "../icons/IconPlus.svelte"
  import IconUser from "../icons/IconUser.svelte"
  import {
    resetGame,
    pendingCharacter,
    pendingCharacterId,
    pendingStoryTitle,
    pendingStoryScenario,
    pendingStoryNPCs,
    pendingStoryLocation,
  } from "../stores/game.js"
  import { loadStoryById } from "./storyLoader.js"

  let stories: StoryMeta[] = []
  let loading = true
  let openMenuId: number | null = null
  let storyCharacters: StoryCharacterGroup[] = []
  let loadingCharacters = false
  let showCharacters = false

  onMount(() => {
    loadStories()
    loadCharacters()
  })

  async function loadStories() {
    try {
      stories = await api.stories.list()
    } catch {
      showError("Failed to load stories")
    } finally {
      loading = false
    }
  }

  async function loadCharacters() {
    loadingCharacters = true
    try {
      storyCharacters = await api.stories.characters()
    } catch {
      showError("Failed to load characters")
    } finally {
      loadingCharacters = false
    }
  }

  async function openStory(story: StoryMeta) {
    try {
      await loadStoryById(story.id)
      navigate("game", { reset: true, params: { storyId: story.id } })
    } catch {
      showError("Failed to load story")
    }
  }

  async function openStoryById(id: number) {
    try {
      await loadStoryById(id)
      navigate("game", { reset: true, params: { storyId: id } })
    } catch {
      showError("Failed to load story")
    }
  }

  function startNew() {
    resetGame()
    pendingCharacter.set(null)
    pendingCharacterId.set(null)
    pendingStoryTitle.set("")
    pendingStoryScenario.set("")
    pendingStoryNPCs.set([])
    pendingStoryLocation.set("")
    navigate("new-story")
  }

  function startNewCharacter() {
    resetGame()
    pendingCharacter.set(null)
    pendingCharacterId.set(null)
    pendingStoryTitle.set("")
    pendingStoryScenario.set("")
    pendingStoryNPCs.set([])
    pendingStoryLocation.set("")
    navigate("char-create")
  }

  function startNewWithCharacter(group: StoryCharacterGroup) {
    resetGame()
    pendingCharacter.set(group.character)
    pendingCharacterId.set(group.id)
    pendingStoryTitle.set("")
    pendingStoryScenario.set("")
    pendingStoryNPCs.set([])
    pendingStoryLocation.set("")
    navigate("new-story")
  }

  async function deleteStory(id: number) {
    const confirmed = await showConfirm({
      title: "Delete story",
      message: "Delete this story? This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    })
    if (!confirmed) return
    try {
      await api.stories.delete(id)
      stories = stories.filter((s) => s.id !== id)
      await loadCharacters()
    } catch {
      showError("Failed to delete story")
    }
    openMenuId = null
  }

  async function importStory() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const { id } = await api.stories.import(JSON.parse(text))
        showError(`Story imported (id: ${id})`)
        await loadStories()
        await loadCharacters()
      } catch {
        showError("Failed to import story — invalid JSON format")
      }
    }
    input.click()
  }

  function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr + "Z").getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return "just now"
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }
</script>

<div class="screen home">
  <!-- Brand header -->
  <div class="brand">
    <span class="brand-flame">🕯</span>
    <h1>Neuradventure</h1>
    <p class="brand-sub">your story, your way</p>
    <button class="settings-btn" onclick={() => navigate("settings")} aria-label="Settings">
      <IconGear size={17} strokeWidth={1.8} />
      {#if $theme === "amoled"}<span class="theme-badge">AMOLED</span>{/if}
    </button>
  </div>

  <!-- New story button -->
  <div class="new-row">
    <button class="new-btn" onclick={startNew}>
      <IconPlus size={13} strokeWidth={2.5} />
      New Story
    </button>
    <button class="new-btn" onclick={startNewCharacter}>
      <IconPlus size={13} strokeWidth={2.5} />
      New Character
    </button>
    <button class="new-btn" onclick={() => (showCharacters = !showCharacters)}>
      <IconUser size={13} strokeWidth={2.5} />
      Characters
    </button>
  </div>

  {#if showCharacters}
    <div class="character-panel">
      {#if loadingCharacters}
        <div class="empty">Loading characters...</div>
      {:else if storyCharacters.length === 0}
        <div class="empty">
          <p>No characters from stories yet.</p>
          <p class="empty-hint">Finish a story to reuse its character here.</p>
        </div>
      {:else}
        {#each storyCharacters as group}
          <div class="char-card">
            <div class="char-card-header">
              <div class="char-card-name">{group.character.name}</div>
              <div class="char-card-meta">
                {group.character.gender} · {group.character.race}
              </div>
            </div>
            <div class="char-card-traits">
              {[...group.character.personality_traits, ...group.character.custom_traits].join(", ") || "No traits"}
            </div>
            <div class="char-card-actions">
              <button class="btn-ghost small" onclick={() => startNewWithCharacter(group)}> New Story </button>
            </div>
            <div class="char-card-stories">
              <div class="char-card-label">Stories</div>
              <div class="char-card-links">
                {#each group.stories as s}
                  <button class="story-link" onclick={() => openStoryById(s.id)}>
                    {s.title}
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {/if}

  <!-- Story list -->
  <div class="story-list" data-scroll-root="screen">
    {#if loading}
      <div class="empty">Loading...</div>
    {:else if stories.length === 0}
      <div class="empty">
        <p>No stories yet.</p>
        <p class="empty-hint">Begin a new adventure above.</p>
      </div>
    {:else}
      {#each stories as story (story.id)}
        <div class="story-row">
          <button class="story-btn" onclick={() => openStory(story)}>
            <span class="story-title">{story.title}</span>
            <span class="story-meta">
              {story.character_name} &middot; {story.turn_count} turns &middot; {relativeTime(story.updated_at)}
            </span>
          </button>

          <div class="story-menu-wrap">
            <button
              class="menu-btn"
              aria-label="Story options"
              onclick={(e) => {
                e.stopPropagation()
                openMenuId = openMenuId === story.id ? null : story.id
              }}
            >
              <IconDots size={14} strokeWidth={2} />
            </button>
            {#if openMenuId === story.id}
              <div class="dropdown">
                <button class="danger-item" onclick={() => deleteStory(story.id)}>Delete</button>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <footer>
    <button class="btn-ghost" onclick={importStory}>Import Story</button>
  </footer>
</div>

<style>
  .home {
    background: var(--bg);
  }

  /* Brand area */
  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2.5rem 1rem 1.5rem;
    gap: 0.35rem;
    border-bottom: 1px solid var(--border);
    position: relative;
  }
  .settings-btn {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    min-width: 40px;
    min-height: 40px;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    transition: color 0.15s;
  }
  .settings-btn:hover {
    color: var(--text);
  }
  .theme-badge {
    font-family: var(--font-ui);
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--accent);
    text-transform: uppercase;
  }
  .brand-flame {
    font-size: 1.8rem;
    opacity: 0.75;
    margin-bottom: 0.25rem;
  }
  h1 {
    font-family: var(--font-brand);
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: var(--accent);
    text-transform: uppercase;
    margin: 0;
  }
  .brand-sub {
    font-family: var(--font-story);
    font-style: italic;
    font-size: 0.82rem;
    color: var(--text-dim);
    letter-spacing: 0.04em;
  }

  /* New story row */
  .new-row {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .new-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: var(--font-ui);
    font-size: 0.82rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 0.55rem 1rem;
    cursor: pointer;
    min-height: 40px;
    transition:
      color 0.15s,
      border-color 0.15s;
    width: 100%;
    justify-content: center;
  }
  .new-btn:hover {
    color: var(--accent);
    border-color: var(--accent);
  }

  .character-panel {
    border-bottom: 1px solid var(--border);
    padding: 0.75rem 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .char-card {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .char-card-header {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .char-card-name {
    font-family: var(--font-story);
    font-size: 1.05rem;
    color: var(--text);
  }
  .char-card-meta {
    font-size: 0.8rem;
    color: var(--text-dim);
  }
  .char-card-traits {
    font-size: 0.85rem;
    color: var(--text-dim);
  }
  .char-card-actions {
    display: flex;
    gap: 0.5rem;
  }
  .char-card-stories {
    border-top: 1px dashed var(--border);
    padding-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .char-card-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }
  .char-card-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .story-link {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.25rem 0.6rem;
    font-size: 0.75rem;
    color: var(--text);
    cursor: pointer;
  }
  .story-link:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  /* Story list */
  .story-list {
    flex: 1;
    overflow-y: auto;
  }
  .story-row {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--border);
    border-left: 2px solid transparent;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .story-row:hover {
    border-left-color: var(--accent);
    background: var(--bg-action);
  }
  .story-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.9rem 1rem 0.9rem 1rem;
    gap: 0.3rem;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
  }
  .story-title {
    font-family: var(--font-story);
    font-size: 1rem;
    color: var(--text);
    font-weight: 400;
  }
  .story-meta {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    color: var(--text-dim);
    letter-spacing: 0.01em;
  }
  .story-menu-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  .menu-btn {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
  }
  .menu-btn:hover {
    color: var(--text);
  }
  .dropdown {
    position: absolute;
    right: 0;
    top: 100%;
  }

  footer {
    padding: 0.85rem 1rem;
    border-top: 1px solid var(--border);
    margin-top: auto;
  }
  footer button {
    width: 100%;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    min-height: 40px;
  }
</style>
