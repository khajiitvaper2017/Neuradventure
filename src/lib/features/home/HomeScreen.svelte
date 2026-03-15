<script lang="ts">
  import { onMount, tick } from "svelte"
  import { stories as storiesService } from "@/services/stories"
  import { chats as chatsService } from "@/services/chats"
  import type { StoryMeta, ChatSummary } from "@/shared/types"
  import type { StoryCharacterGroup, CharacterImportResult } from "@/shared/api-types"
  import { navigate, openCharSheetForCharacter, showError, showConfirm } from "@/stores/ui"
  import { theme } from "@/stores/settings"
  import IconDots from "@/components/icons/IconDots.svelte"
  import IconDocument from "@/components/icons/IconDocument.svelte"
  import IconGear from "@/components/icons/IconGear.svelte"
  import IconPlus from "@/components/icons/IconPlus.svelte"
  import IconUsers from "@/components/icons/IconUsers.svelte"
  import Select from "@/components/controls/Select.svelte"
  import SegmentedTabs from "@/components/controls/SegmentedTabs.svelte"
  import {
    resetActiveStory,
    resetGame,
    pendingCharacter,
    pendingCharacterId,
    pendingCharacterImportText,
    pendingCharacterImportCard,
    pendingCharacterImportAvatarDataUrl,
    pendingCharacterGenerateDescription,
    pendingStoryTitle,
    pendingStoryScenario,
    pendingStoryNPCs,
    pendingStoryLocation,
    pendingStoryModules,
  } from "@/stores/game"
  import { resetChat } from "@/stores/chat"
  import { loadStoryById } from "@/utils/storyLoader"

  let stories: StoryMeta[] = []
  let loading = true
  let openStoryMenuId: number | null = null
  let openChatMenuId: number | null = null
  let openCharacterMenuId: number | null = null
  let storyCharacters: StoryCharacterGroup[] = []
  let loadingCharacters = false
  let chats: ChatSummary[] = []
  let loadingChats = false
  let homeScroll: HTMLDivElement | null = null

  type LibrarySection = "stories" | "chats" | "characters"
  let section: LibrarySection = "stories"
  let query = ""
  let sort: "recent" | "az" = "recent"
  let menuPlacement: Record<string, "up" | "down"> = {}
  const sortOptions = [
    { value: "recent", label: "Recent" },
    { value: "az", label: "A–Z" },
  ]

  $: sectionTabs = [
    { value: "stories" as const, label: "Stories", badge: stories.length },
    { value: "chats" as const, label: "Chats", badge: chats.length },
    { value: "characters" as const, label: "Characters", badge: storyCharacters.length },
  ]

  onMount(() => {
    loadStories()
    loadCharacters()
    loadChats()
  })

  async function loadStories() {
    try {
      stories = await storiesService.list()
    } catch (err) {
      console.error("[home] Failed to load stories", err)
      showError("Failed to load stories")
    } finally {
      loading = false
    }
  }

  async function loadCharacters() {
    loadingCharacters = true
    try {
      storyCharacters = await storiesService.characters()
    } catch (err) {
      console.error("[home] Failed to load characters", err)
      showError("Failed to load characters")
    } finally {
      loadingCharacters = false
    }
  }

  async function loadChats() {
    loadingChats = true
    try {
      chats = await chatsService.list()
    } catch (err) {
      console.error("[home] Failed to load chats", err)
      showError("Failed to load chats")
    } finally {
      loadingChats = false
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

  function openChat(chat: ChatSummary) {
    navigate("chat", { reset: true, params: { chatId: chat.id } })
  }

  function startNew() {
    resetActiveStory()
    navigate("new-story")
  }

  function startNewChat() {
    resetChat()
    navigate("new-chat")
  }

  function startNewCharacter() {
    resetActiveStory()
    navigate("char-create")
  }

  function startNewWithCharacter(group: StoryCharacterGroup) {
    resetActiveStory()
    pendingCharacter.set(group.character)
    pendingCharacterId.set(group.id)
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
      await storiesService.delete(id)
      stories = stories.filter((s) => s.id !== id)
      await loadCharacters()
    } catch {
      showError("Failed to delete story")
    }
    openStoryMenuId = null
  }

  async function deleteChat(id: number) {
    const confirmed = await showConfirm({
      title: "Delete chat",
      message: "Delete this chat? This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    })
    if (!confirmed) return
    try {
      await chatsService.delete(id)
      chats = chats.filter((c) => c.id !== id)
    } catch {
      showError("Failed to delete chat")
    }
    openChatMenuId = null
  }

  async function deleteCharacter(id: number) {
    openCharacterMenuId = null
    const confirmed = await showConfirm({
      title: "Delete character",
      message:
        "Delete this character from your library? Stories and chats will keep their embedded character state, but you won't be able to reuse this character for new stories/chats.",
      confirmLabel: "Delete",
      danger: true,
    })
    if (!confirmed) return
    try {
      await storiesService.deleteCharacter(id)
      storyCharacters = storyCharacters.filter((c) => c.id !== id)
    } catch {
      showError("Failed to delete character")
    }
  }

  async function importStory() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json,.jsonl"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        let payload: object | string = text
        try {
          payload = JSON.parse(text)
        } catch {
          // keep raw text for JSONL
        }
        const { id } = await storiesService.import(payload)
        showError(`Story imported (id: ${id})`)
        await loadStories()
        await loadCharacters()
      } catch {
        showError("Failed to import story — invalid format")
      }
    }
    input.click()
  }

  async function importCharacter() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json,.png"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        let result: CharacterImportResult
        if (file.name.toLowerCase().endsWith(".png")) {
          const buf = await file.arrayBuffer()
          const bytes = new Uint8Array(buf)
          let binary = ""
          const chunkSize = 0x8000
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
          }
          const png_base64 = btoa(binary)
          result = await storiesService.importCharacter({ png_base64, filename: file.name })
        } else {
          const text = await file.text()
          result = await storiesService.importCharacter(JSON.parse(text))
        }
        if (result.needs_review) {
          resetGame()
          pendingCharacter.set(result.character)
          pendingCharacterId.set(null)
          pendingCharacterImportText.set(result.source_text ?? "")
          pendingCharacterImportCard.set((result as { tavern_card?: object }).tavern_card ?? null)
          pendingCharacterImportAvatarDataUrl.set(result.tavern_avatar_data_url ?? null)
          pendingCharacterGenerateDescription.set(result.source_text ?? "")
          pendingStoryTitle.set("")
          pendingStoryScenario.set("")
          pendingStoryNPCs.set([])
          pendingStoryLocation.set("")
          pendingStoryModules.set(null)
          navigate("char-create")
        } else {
          showError(`Character "${result.character.name}" imported`)
          await loadCharacters()
        }
      } catch (err) {
        showError(err instanceof Error ? err.message : "Failed to import character — invalid format")
      }
    }
    input.click()
  }

  async function exportCharacter(group: StoryCharacterGroup, format: "neuradventure" | "tavern-card") {
    try {
      await storiesService.exportCharacterAndDownload(group.id, format)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to export character")
    }
  }

  function setSection(next: LibrarySection) {
    section = next
    openStoryMenuId = null
    openChatMenuId = null
    openCharacterMenuId = null
    query = ""
  }

  function updatedAtMs(dateStr: string): number {
    return new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z").getTime()
  }

  function menuKey(kind: "story" | "chat" | "character", id: number): string {
    return `${kind}:${id}`
  }

  function isMenuUp(kind: "story" | "chat" | "character", id: number): boolean {
    return menuPlacement[menuKey(kind, id)] === "up"
  }

  async function updateMenuPlacement(kind: "story" | "chat" | "character", id: number, anchor: HTMLElement) {
    await tick()
    const wrap = anchor.closest(".lib-menu-wrap") as HTMLElement | null
    const dropdown = wrap?.querySelector(".lib-dropdown") as HTMLElement | null
    if (!dropdown) return

    const dropdownRect = dropdown.getBoundingClientRect()
    const anchorRect = anchor.getBoundingClientRect()
    const scrollRect = homeScroll?.getBoundingClientRect()
    const clipTop = scrollRect?.top ?? 0
    const clipBottom = scrollRect?.bottom ?? window.innerHeight
    const gutter = 10
    const overflowsBottom = dropdownRect.bottom > clipBottom - gutter
    const spaceAbove = anchorRect.top - clipTop
    const spaceBelow = clipBottom - anchorRect.bottom

    const openUp = overflowsBottom && spaceAbove > spaceBelow
    const next: "up" | "down" = openUp ? "up" : "down"
    const key = menuKey(kind, id)
    if (menuPlacement[key] !== next) {
      menuPlacement = { ...menuPlacement, [key]: next }
    }
  }

  function matchesQuery(value: string, q: string): boolean {
    return value.toLowerCase().includes(q)
  }

  function characterLastPlayedMs(group: StoryCharacterGroup): number {
    let max = 0
    for (const s of group.stories) max = Math.max(max, updatedAtMs(s.updated_at))
    return max
  }

  function relativeTime(dateStr: string): string {
    const diff = Date.now() - updatedAtMs(dateStr)
    const m = Math.floor(diff / 60000)
    if (m < 1) return "just now"
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  $: q = query.trim().toLowerCase()

  $: filteredStories = stories
    .filter((s) => {
      if (!q) return true
      return matchesQuery(`${s.title} ${s.character_name}`, q)
    })
    .slice()
    .sort((a, b) => {
      if (sort === "az") return a.title.localeCompare(b.title)
      return updatedAtMs(b.updated_at) - updatedAtMs(a.updated_at)
    })

  $: filteredChats = chats
    .filter((c) => {
      if (!q) return true
      return matchesQuery(`${c.title} ${c.player_name} ${c.participants.join(" ")}`, q)
    })
    .slice()
    .sort((a, b) => {
      if (sort === "az") return (a.title || a.player_name || "").localeCompare(b.title || b.player_name || "")
      return updatedAtMs(b.updated_at) - updatedAtMs(a.updated_at)
    })

  $: filteredCharacters = storyCharacters
    .filter((g) => {
      if (!q) return true
      const traits = [...g.character.personality_traits, ...g.character.quirks, ...g.character.perks].join(" ")
      return matchesQuery(`${g.character.name} ${g.character.gender} ${g.character.race} ${traits}`, q)
    })
    .slice()
    .sort((a, b) => {
      if (sort === "az") return a.character.name.localeCompare(b.character.name)
      return characterLastPlayedMs(b) - characterLastPlayedMs(a)
    })
</script>

<div class="screen home">
  <!-- Brand header -->
  <div class="brand">
    <h1>Neuradventure</h1>
    <button class="settings-btn" onclick={() => navigate("settings")} aria-label="Settings">
      <IconGear size={17} strokeWidth={1.8} />
    </button>
  </div>

  <!-- New story button -->
  <div class="new-row">
    <button class="new-btn" onclick={startNew}>
      <IconPlus size={13} strokeWidth={2.5} />
      New Story
    </button>
    <button class="new-btn" onclick={startNewChat}>
      <IconUsers size={13} strokeWidth={2.5} />
      New Chat
    </button>
    <button class="new-btn" onclick={startNewCharacter}>
      <IconPlus size={13} strokeWidth={2.5} />
      New Character
    </button>
  </div>

  <div class="lib-toolbar lib-toolbar--flat" aria-label="Library controls">
    <SegmentedTabs
      ariaLabel="Library section"
      tabs={sectionTabs}
      value={section}
      onChange={(next) => setSection(next as LibrarySection)}
      variant="nav"
      stretch
    />

    <div class="lib-controls">
      <label class="lib-search">
        <span class="sr-only">Search</span>
        <input
          class="text-input lib-search-input"
          type="search"
          placeholder={`Search ${section}...`}
          bind:value={query}
        />
      </label>
      <label class="lib-sort">
        <span class="sr-only">Sort</span>
        <Select className="lib-sort-input" width="100%" bind:value={sort} options={sortOptions} ariaLabel="Sort" />
      </label>
    </div>
  </div>

  <div class="home-scroll" data-scroll-root="screen" bind:this={homeScroll}>
    <section class="lib-shell lib-shell--footer-safe" aria-label="Library">
      {#if section === "stories"}
        {#if loading}
          <div class="empty">Loading stories...</div>
        {:else if filteredStories.length === 0}
          <div class="empty">
            {#if stories.length === 0}
              <p>No stories yet.</p>
              <p class="empty-hint">Begin a new adventure above.</p>
            {:else}
              <p>No stories found.</p>
              <p class="empty-hint">Try a different search.</p>
            {/if}
          </div>
        {:else}
          <div class="lib-grid" role="list">
            {#each filteredStories as story (story.id)}
              <div class="lib-card" role="listitem">
                <button class="lib-card-main" onclick={() => openStory(story)}>
                  <div class="lib-card-title">{story.title}</div>
                  <div class="lib-card-meta">
                    {story.character_name} · {story.turn_count} turns
                  </div>
                  <div class="lib-card-foot">Updated {relativeTime(story.updated_at)}</div>
                </button>

                <div class="lib-menu-wrap">
                  <button
                    class="menu-btn"
                    aria-label="Story options"
                    onclick={(e) => {
                      e.stopPropagation()
                      openChatMenuId = null
                      openCharacterMenuId = null
                      openStoryMenuId = openStoryMenuId === story.id ? null : story.id
                      if (openStoryMenuId === story.id) {
                        void updateMenuPlacement("story", story.id, e.currentTarget as HTMLElement)
                      }
                    }}
                  >
                    <IconDots size={14} strokeWidth={2} />
                  </button>
                  {#if openStoryMenuId === story.id}
                    <div class="dropdown lib-dropdown" class:lib-dropdown--up={isMenuUp("story", story.id)}>
                      <button
                        type="button"
                        class="dropdown-link"
                        onclick={() => {
                          openStoryMenuId = null
                          void storiesService
                            .exportAndDownload(story.id, "neuradventure")
                            .catch((err) => showError(err instanceof Error ? err.message : "Failed to export"))
                        }}
                      >
                        Export JSON
                      </button>
                      <button
                        type="button"
                        class="dropdown-link"
                        onclick={() => {
                          openStoryMenuId = null
                          void storiesService
                            .exportAndDownload(story.id, "tavern")
                            .catch((err) => showError(err instanceof Error ? err.message : "Failed to export"))
                        }}
                      >
                        Export ST Chat
                      </button>
                      <button
                        type="button"
                        class="dropdown-link"
                        onclick={() => {
                          openStoryMenuId = null
                          void storiesService
                            .exportAndDownload(story.id, "plaintext")
                            .catch((err) => showError(err instanceof Error ? err.message : "Failed to export"))
                        }}
                      >
                        Export Text
                      </button>
                      <button class="danger-item" onclick={() => deleteStory(story.id)}>Delete</button>
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {:else if section === "chats"}
        {#if loadingChats}
          <div class="empty">Loading chats...</div>
        {:else if filteredChats.length === 0}
          <div class="empty">
            {#if chats.length === 0}
              <p>No chats yet.</p>
              <p class="empty-hint">Start a new group chat above.</p>
            {:else}
              <p>No chats found.</p>
              <p class="empty-hint">Try a different search.</p>
            {/if}
          </div>
        {:else}
          <div class="lib-grid" role="list">
            {#each filteredChats as chat (chat.id)}
              <div class="lib-card" role="listitem">
                <button class="lib-card-main" onclick={() => openChat(chat)}>
                  <div class="lib-card-title">{chat.title || chat.player_name || "Chat"}</div>
                  <div class="lib-chip-row" aria-label="Participants">
                    {#each chat.participants.slice(0, 5) as p (p)}
                      <span class="lib-chip">{p}</span>
                    {/each}
                    {#if chat.participants.length > 5}
                      <span class="lib-chip lib-chip--muted">+{chat.participants.length - 5}</span>
                    {/if}
                  </div>
                  <div class="lib-card-foot">
                    {chat.message_count} messages · Updated {relativeTime(chat.updated_at)}
                  </div>
                </button>

                <div class="lib-menu-wrap">
                  <button
                    class="menu-btn"
                    aria-label="Chat options"
                    onclick={(e) => {
                      e.stopPropagation()
                      openStoryMenuId = null
                      openCharacterMenuId = null
                      openChatMenuId = openChatMenuId === chat.id ? null : chat.id
                      if (openChatMenuId === chat.id) {
                        void updateMenuPlacement("chat", chat.id, e.currentTarget as HTMLElement)
                      }
                    }}
                  >
                    <IconDots size={14} strokeWidth={2} />
                  </button>
                  {#if openChatMenuId === chat.id}
                    <div class="dropdown lib-dropdown" class:lib-dropdown--up={isMenuUp("chat", chat.id)}>
                      <button
                        type="button"
                        class="dropdown-link"
                        onclick={() => {
                          openChatMenuId = null
                          void chatsService
                            .exportAndDownload(chat.id, "neuradventure")
                            .catch((err) => showError(err instanceof Error ? err.message : "Failed to export"))
                        }}
                      >
                        Export JSON
                      </button>
                      <button
                        type="button"
                        class="dropdown-link"
                        onclick={() => {
                          openChatMenuId = null
                          void chatsService
                            .exportAndDownload(chat.id, "tavern")
                            .catch((err) => showError(err instanceof Error ? err.message : "Failed to export"))
                        }}
                      >
                        Export ST Chat
                      </button>
                      <button
                        type="button"
                        class="dropdown-link"
                        onclick={() => {
                          openChatMenuId = null
                          void chatsService
                            .exportAndDownload(chat.id, "plaintext")
                            .catch((err) => showError(err instanceof Error ? err.message : "Failed to export"))
                        }}
                      >
                        Export Text
                      </button>
                      <button class="danger-item" onclick={() => deleteChat(chat.id)}>Delete</button>
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {:else if loadingCharacters}
        <div class="empty">Loading characters...</div>
      {:else if filteredCharacters.length === 0}
        <div class="empty">
          {#if storyCharacters.length === 0}
            <p>No characters from stories yet.</p>
            <p class="empty-hint">Finish a story to reuse its character here.</p>
          {:else}
            <p>No characters found.</p>
            <p class="empty-hint">Try a different search.</p>
          {/if}
        </div>
      {:else}
        <div class="lib-grid" role="list">
          {#each filteredCharacters as group (group.id)}
            <div class="lib-card lib-card--character" role="listitem">
              <button class="lib-card-main" onclick={() => openCharSheetForCharacter(group.id)}>
                <div class="lib-char-head">
                  {#if group.card?.avatar}
                    <img class="lib-avatar" src={group.card.avatar} alt="" />
                  {:else}
                    <div class="lib-avatar lib-avatar--placeholder" aria-hidden="true"></div>
                  {/if}
                  <div class="lib-char-title">
                    <div class="lib-card-title">{group.character.name}</div>
                    <div class="lib-card-meta">{group.character.gender} · {group.character.race}</div>
                  </div>
                </div>

                <div class="lib-card-meta lib-card-meta--clamp">
                  {[...group.character.personality_traits, ...group.character.quirks, ...group.character.perks].join(
                    ", ",
                  ) || "No traits"}
                </div>

                {#if group.stories.length > 0}
                  <div class="lib-card-foot">
                    {group.stories.length} stories · Last played
                    {relativeTime(new Date(characterLastPlayedMs(group)).toISOString())}
                  </div>
                {:else}
                  <div class="lib-card-foot">No stories yet</div>
                {/if}

                {#if group.stories.length > 0}
                  <div class="lib-chip-row" aria-label="Recent stories">
                    {#each group.stories
                      .slice()
                      .sort((a, b) => updatedAtMs(b.updated_at) - updatedAtMs(a.updated_at))
                      .slice(0, 4) as s (s.id)}
                      <span class="lib-chip lib-chip--button">{s.title}</span>
                    {/each}
                    {#if group.stories.length > 4}
                      <span class="lib-chip lib-chip--muted">+{group.stories.length - 4}</span>
                    {/if}
                  </div>
                {/if}
              </button>

              <div class="lib-menu-wrap">
                <button
                  class="menu-btn"
                  aria-label="Character options"
                  onclick={(e) => {
                    e.stopPropagation()
                    openStoryMenuId = null
                    openChatMenuId = null
                    openCharacterMenuId = openCharacterMenuId === group.id ? null : group.id
                    if (openCharacterMenuId === group.id) {
                      void updateMenuPlacement("character", group.id, e.currentTarget as HTMLElement)
                    }
                  }}
                >
                  <IconDots size={14} strokeWidth={2} />
                </button>
                {#if openCharacterMenuId === group.id}
                  <div class="dropdown lib-dropdown" class:lib-dropdown--up={isMenuUp("character", group.id)}>
                    <button
                      class="btn-icon"
                      onclick={() => {
                        openCharacterMenuId = null
                        openCharSheetForCharacter(group.id)
                      }}
                    >
                      <IconDocument size={14} strokeWidth={1.6} />
                      Details
                    </button>
                    <button
                      onclick={() => {
                        openCharacterMenuId = null
                        startNewWithCharacter(group)
                      }}
                    >
                      New Story
                    </button>
                    <button
                      onclick={() => {
                        openCharacterMenuId = null
                        void exportCharacter(group, "tavern-card")
                      }}
                    >
                      Export ST
                    </button>
                    <button
                      onclick={() => {
                        openCharacterMenuId = null
                        void exportCharacter(group, "neuradventure")
                      }}
                    >
                      Export JSON
                    </button>
                    <button class="danger-item" onclick={() => deleteCharacter(group.id)}>Delete</button>
                  </div>
                {/if}
              </div>

              {#if group.stories.length > 0}
                <div class="lib-card-sub">
                  <details class="lib-details">
                    <summary class="lib-details-summary">
                      Stories <span class="lib-count">{group.stories.length}</span>
                    </summary>
                    <div class="lib-story-links">
                      {#each group.stories
                        .slice()
                        .sort((a, b) => updatedAtMs(b.updated_at) - updatedAtMs(a.updated_at)) as s (s.id)}
                        <button class="lib-story-link" onclick={() => openStoryById(s.id)}>{s.title}</button>
                      {/each}
                    </div>
                  </details>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <footer>
    <button class="btn-ghost" onclick={importStory}>Import Story</button>
    <button class="btn-ghost" onclick={importCharacter}>Import Character</button>
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
  h1 {
    font-family: var(--font-brand);
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: var(--accent);
    margin: 0;
  }

  /* New story row */
  .new-row {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--border);
    display: grid;
    grid-template-columns: repeat(3, 1fr);
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

  .home-scroll {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  @media (max-width: 440px) {
    .new-row {
      grid-template-columns: 1fr;
    }
  }

  footer {
    padding: 0.85rem 1rem;
    border-top: 1px solid var(--border);
  }
  footer button {
    width: 100%;
    font-size: 0.8rem;
    letter-spacing: 0.05em;
    min-height: 40px;
  }
</style>
