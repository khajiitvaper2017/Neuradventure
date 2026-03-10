<script lang="ts">
  import { onMount } from "svelte"
  import { api, type StoryMeta } from "../api/client.js"
  import { activeScreen, showError } from "../stores/ui.js"
  import { theme } from "../stores/settings.js"
  import {
    currentStoryId, currentStoryTitle, character,
    worldState, npcs, turns, resetGame,
  } from "../stores/game.js"

  let stories: StoryMeta[] = []
  let loading = true
  let openMenuId: number | null = null

  onMount(loadStories)

  async function loadStories() {
    try { stories = await api.stories.list() }
    catch { showError("Failed to load stories") }
    finally { loading = false }
  }

  async function openStory(story: StoryMeta) {
    try {
      const [detail, storyTurns] = await Promise.all([
        api.stories.get(story.id),
        api.turns.list(story.id),
      ])
      currentStoryId.set(detail.id)
      currentStoryTitle.set(detail.title)
      character.set(detail.character)
      worldState.set(detail.world)
      npcs.set(detail.npcs)
      turns.set(storyTurns)
      activeScreen.set("game")
    } catch { showError("Failed to load story") }
  }

  function startNew() {
    resetGame()
    activeScreen.set("char-create")
  }

  async function deleteStory(id: number) {
    if (!confirm("Delete this story? This cannot be undone.")) return
    try {
      await api.stories.delete(id)
      stories = stories.filter((s) => s.id !== id)
    } catch { showError("Failed to delete story") }
    openMenuId = null
  }

  function downloadStory(id: number) {
    const a = document.createElement("a")
    a.href = api.stories.exportUrl(id)
    a.download = `story-${id}.json`
    a.click()
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
      } catch { showError("Failed to import story — invalid JSON format") }
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
    <button class="settings-btn" onclick={() => activeScreen.set("settings")} aria-label="Settings">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
      {#if $theme === "amoled"}<span class="theme-badge">AMOLED</span>{/if}
    </button>
  </div>

  <!-- New story button -->
  <div class="new-row">
    <button class="new-btn" onclick={startNew}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      New Story
    </button>
  </div>

  <!-- Story list -->
  <div class="story-list">
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>
              </svg>
            </button>
            {#if openMenuId === story.id}
              <div class="dropdown">
                <button onclick={() => downloadStory(story.id)}>Export JSON</button>
                <button class="del" onclick={() => deleteStory(story.id)}>Delete</button>
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
  .settings-btn:hover { color: var(--text); }
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
    transition: color 0.15s, border-color 0.15s;
    width: 100%;
    justify-content: center;
  }
  .new-btn:hover {
    color: var(--accent);
    border-color: var(--accent);
  }

  /* Story list */
  .story-list {
    flex: 1;
    overflow-y: auto;
  }
  .empty {
    padding: 2.5rem 1rem;
    text-align: center;
    color: var(--text-dim);
    font-size: 0.9rem;
    font-family: var(--font-story);
    font-style: italic;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .empty-hint {
    font-size: 0.8rem;
    opacity: 0.6;
  }
  .story-row {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--border);
    border-left: 2px solid transparent;
    transition: border-color 0.15s, background 0.15s;
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
  .menu-btn:hover { color: var(--text); }
  .dropdown {
    position: absolute;
    right: 0;
    top: 100%;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    z-index: 10;
    min-width: 148px;
  }
  .dropdown button {
    display: block;
    width: 100%;
    padding: 0.7rem 1rem;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    color: var(--text);
    font-size: 0.85rem;
    font-family: var(--font-ui);
  }
  .dropdown button:hover { background: var(--bg-action); }
  .dropdown .del { color: var(--danger); }

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
