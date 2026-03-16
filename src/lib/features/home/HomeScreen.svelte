<script lang="ts">
  import { onMount } from "svelte"
  import { stories as storiesService } from "@/services/stories"
  import { chats as chatsService } from "@/services/chats"
  import type { StoryMeta, ChatSummary } from "@/shared/types"
  import type { StoryCharacterGroup, CharacterImportResult } from "@/shared/api-types"
  import { navigate, openCharSheetForCharacter } from "@/stores/router"
  import { showError, showConfirm, showQuietNotice } from "@/stores/ui"
  import IconDots from "@/components/icons/IconDots.svelte"
  import IconDocument from "@/components/icons/IconDocument.svelte"
  import IconGear from "@/components/icons/IconGear.svelte"
  import IconUsers from "@/components/icons/IconUsers.svelte"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Card } from "@/components/ui/card"
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"
  import * as Select from "@/components/ui/select"
  import * as Tabs from "@/components/ui/tabs/index.js"
  import { ScrollArea } from "@/components/ui/scroll-area"
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
  import IconUser from "@/components/icons/IconUser.svelte"
  import ThemeToggle from "@/components/controls/ThemeToggle.svelte"
  import { pickFile, readFileAsDataUrl } from "@/utils/filePick"
  import { Book } from "@lucide/svelte"

  let stories = $state<StoryMeta[]>([])
  let loading = $state(true)
  let storyCharacters = $state<StoryCharacterGroup[]>([])
  let loadingCharacters = $state(false)
  let chats = $state<ChatSummary[]>([])
  let loadingChats = $state(false)

  type LibrarySection = "stories" | "chats" | "characters"
  let section = $state<LibrarySection>("stories")
  let query = $state("")
  let sort = $state<"recent" | "az">("recent")
  const sortOptions = [
    { value: "recent", label: "Recent" },
    { value: "az", label: "A–Z" },
  ]

  const sortLabel = $derived(sortOptions.find((o) => o.value === sort)?.label ?? "Sort")

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

  function openStory(story: StoryMeta) {
    navigate("game", { reset: true, params: { storyId: story.id } })
  }

  function openStoryById(id: number) {
    navigate("game", { reset: true, params: { storyId: id } })
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
  }

  async function deleteCharacter(id: number) {
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
    const file = await pickFile({ accept: ".json,.jsonl" })
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
      showQuietNotice(`Story imported (id: ${id})`)
      await loadStories()
      await loadCharacters()
    } catch {
      showError("Failed to import story — invalid format")
    }
  }

  async function importCharacter() {
    const file = await pickFile({ accept: ".json,.png" })
    if (!file) return
    try {
      let result: CharacterImportResult
      if (file.name.toLowerCase().endsWith(".png")) {
        const png_data_url = await readFileAsDataUrl(file)
        result = await storiesService.importCharacter({ png_data_url, filename: file.name })
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
        showQuietNotice(`Character "${result.character.name}" imported`)
        await loadCharacters()
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to import character — invalid format")
    }
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
    query = ""
  }

  function updatedAtMs(dateStr: string): number {
    return new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z").getTime()
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

  const q = $derived(query.trim().toLowerCase())

  const filteredStories = $derived(
    stories
      .filter((s) => {
        if (!q) return true
        return matchesQuery(`${s.title} ${s.character_name}`, q)
      })
      .slice()
      .sort((a, b) => {
        if (sort === "az") return a.title.localeCompare(b.title)
        return updatedAtMs(b.updated_at) - updatedAtMs(a.updated_at)
      }),
  )

  const filteredChats = $derived(
    chats
      .filter((c) => {
        if (!q) return true
        return matchesQuery(`${c.title} ${c.player_name} ${c.participants.join(" ")}`, q)
      })
      .slice()
      .sort((a, b) => {
        if (sort === "az") return (a.title || a.player_name || "").localeCompare(b.title || b.player_name || "")
        return updatedAtMs(b.updated_at) - updatedAtMs(a.updated_at)
      }),
  )

  const filteredCharacters = $derived(
    storyCharacters
      .filter((g) => {
        if (!q) return true
        const traits = [...g.character.personality_traits, ...g.character.quirks, ...g.character.perks].join(" ")
        return matchesQuery(`${g.character.name} ${g.character.gender} ${g.character.race} ${traits}`, q)
      })
      .slice()
      .sort((a, b) => {
        if (sort === "az") return a.character.name.localeCompare(b.character.name)
        return characterLastPlayedMs(b) - characterLastPlayedMs(a)
      }),
  )
</script>

<div class="mx-auto flex h-dvh w-full max-w-3xl flex-col">
  <header class="relative border-b px-4 py-6 text-center">
    <h1 class="text-sm font-semibold uppercase tracking-[0.28em] text-primary">Neuradventure</h1>
    <p class="mt-2 text-xs text-muted-foreground">Stories, chats, and characters — all offline on this device.</p>
    <div class="absolute left-3 top-3">
      <ThemeToggle />
    </div>
    <Button
      variant="ghost"
      size="icon"
      class="absolute right-3 top-3 h-9 w-9 text-muted-foreground"
      onclick={() => navigate("settings")}
      aria-label="Settings"
      title="Settings"
    >
      <IconGear size={17} strokeWidth={1.8} />
    </Button>
  </header>

  <div class="grid gap-2 border-b px-4 py-3 grid-cols-3">
    <Button variant="outline" onclick={startNew} class="justify-center">
      <Book size={14} strokeWidth={2.5} />
      New Story
    </Button>
    <Button variant="outline" onclick={startNewCharacter} class="justify-center">
      <IconUser size={14} strokeWidth={2.5} />
      New Character
    </Button>
    <Button variant="outline" onclick={startNewChat} class="justify-center">
      <IconUsers size={14} strokeWidth={2.5} />
      New Chat
    </Button>
  </div>

  <div class="border-b px-4 py-3">
    <div class="flex flex-col gap-3">
      <Tabs.Root value={section} onValueChange={(next) => setSection(next as LibrarySection)}>
        <Tabs.List aria-label="Library section" class="w-full">
          <Tabs.Trigger value="stories" class="flex-1 text-xs font-medium uppercase tracking-wider">
            {stories.length}
            {stories.length === 1 ? "Story" : "Stories"}
          </Tabs.Trigger>
          <Tabs.Trigger value="chats" class="flex-1 text-xs font-medium uppercase tracking-wider">
            {chats.length}
            {chats.length === 1 ? "Chat" : "Chats"}
          </Tabs.Trigger>
          <Tabs.Trigger value="characters" class="flex-1 text-xs font-medium uppercase tracking-wider">
            {storyCharacters.length}
            {storyCharacters.length === 1 ? "Character" : "Characters"}
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>

      <div class="flex items-center gap-2">
        <div class="min-w-0 flex-1">
          <Label class="sr-only" for="home-search">Search</Label>
          <Input
            id="home-search"
            class="w-full"
            type="search"
            placeholder={`Search ${section}...`}
            bind:value={query}
          />
        </div>
        <div class="w-32 shrink-0 sm:w-40">
          <Label class="sr-only" for="home-sort">Sort</Label>
          <Select.Root type="single" bind:value={sort} items={sortOptions}>
            <Select.Trigger id="home-sort" class="w-full" aria-label="Sort">
              {sortLabel}
            </Select.Trigger>
            <Select.Content>
              {#each sortOptions as option (option.value)}
                <Select.Item {...option} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>
    </div>
  </div>

  <ScrollArea class="min-h-0 flex-1">
    <div class="px-4 py-4">
      {#if section === "stories"}
        <div class="mb-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onclick={importStory}>Import story</Button>
        </div>

        {#if loading}
          <div
            class="grid place-items-center rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground"
          >
            Loading stories...
          </div>
        {:else if filteredStories.length === 0}
          <div
            class="grid place-items-center rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground"
          >
            {#if stories.length === 0}
              <div class="space-y-1">
                <p>No stories yet.</p>
                <p class="text-xs text-muted-foreground/80">Begin a new adventure above.</p>
              </div>
            {:else}
              <div class="space-y-1">
                <p>No stories found.</p>
                <p class="text-xs text-muted-foreground/80">Try a different search.</p>
              </div>
            {/if}
          </div>
        {:else}
          <div class="grid gap-3" role="list" aria-label="Stories">
            {#each filteredStories as story (story.id)}
              <Card class="group">
                <div class="flex items-start gap-2 p-3">
                  <Button
                    type="button"
                    variant="ghost"
                    class="h-auto min-w-0 flex-1 flex-col items-start justify-start gap-0 p-0 text-left hover:bg-transparent"
                    onclick={() => openStory(story)}
                    aria-label={`Open story ${story.title}`}
                  >
                    <div class="truncate text-sm font-semibold">{story.title}</div>
                    <div class="mt-1 text-xs text-muted-foreground">
                      {story.character_name} · {story.turn_count} turns
                    </div>
                    <div class="mt-2 text-xs text-muted-foreground">Updated {relativeTime(story.updated_at)}</div>
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      class="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <span class="sr-only">Story options</span>
                      <IconDots size={15} strokeWidth={1.8} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" class="w-48">
                      <DropdownMenuItem
                        onSelect={() =>
                          void storiesService
                            .exportAndDownload(story.id, "neuradventure")
                            .catch((err) => showError(err instanceof Error ? err.message : "Failed to export"))}
                      >
                        Export JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          void storiesService
                            .exportAndDownload(story.id, "tavern")
                            .catch((err) => showError(err instanceof Error ? err.message : "Failed to export"))}
                      >
                        Export ST Chat
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          void storiesService
                            .exportAndDownload(story.id, "plaintext")
                            .catch((err) => showError(err instanceof Error ? err.message : "Failed to export"))}
                      >
                        Export Text
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        class="text-destructive focus:text-destructive"
                        onSelect={() => deleteStory(story.id)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            {/each}
          </div>
        {/if}
      {:else if section === "chats"}
        {#if loadingChats}
          <div
            class="grid place-items-center rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground"
          >
            Loading chats...
          </div>
        {:else if filteredChats.length === 0}
          <div
            class="grid place-items-center rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground"
          >
            {#if chats.length === 0}
              <div class="space-y-1">
                <p>No chats yet.</p>
                <p class="text-xs text-muted-foreground/80">Start a new group chat above.</p>
              </div>
            {:else}
              <div class="space-y-1">
                <p>No chats found.</p>
                <p class="text-xs text-muted-foreground/80">Try a different search.</p>
              </div>
            {/if}
          </div>
        {:else}
          <div class="grid gap-3" role="list" aria-label="Chats">
            {#each filteredChats as chat (chat.id)}
              <Card class="group">
                <div class="flex items-start gap-2 p-3">
                  <Button
                    type="button"
                    variant="ghost"
                    class="h-auto min-w-0 flex-1 flex-col items-start justify-start gap-0 p-0 text-left hover:bg-transparent"
                    onclick={() => openChat(chat)}
                  >
                    <div class="truncate text-sm font-semibold">{chat.title || chat.player_name || "Chat"}</div>
                    <div class="mt-2 flex flex-wrap gap-1.5" aria-label="Participants">
                      {#each chat.participants.slice(0, 5) as p (p)}
                        <Badge variant="secondary" class="px-2 py-0 text-[11px] font-medium">
                          {p}
                        </Badge>
                      {/each}
                      {#if chat.participants.length > 5}
                        <Badge variant="outline" class="px-2 py-0 text-[11px] font-medium text-muted-foreground">
                          +{chat.participants.length - 5}
                        </Badge>
                      {/if}
                    </div>
                    <div class="mt-2 text-xs text-muted-foreground">
                      {chat.message_count} messages · Updated {relativeTime(chat.updated_at)}
                    </div>
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      class="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <span class="sr-only">Chat options</span>
                      <IconDots size={15} strokeWidth={1.8} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" class="w-48">
                      <DropdownMenuItem
                        onSelect={() =>
                          void chatsService
                            .exportAndDownload(chat.id, "neuradventure")
                            .catch((err) => showError(err instanceof Error ? err.message : "Failed to export"))}
                      >
                        Export JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          void chatsService
                            .exportAndDownload(chat.id, "tavern")
                            .catch((err) => showError(err instanceof Error ? err.message : "Failed to export"))}
                      >
                        Export ST Chat
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          void chatsService
                            .exportAndDownload(chat.id, "plaintext")
                            .catch((err) => showError(err instanceof Error ? err.message : "Failed to export"))}
                      >
                        Export Text
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        class="text-destructive focus:text-destructive"
                        onSelect={() => deleteChat(chat.id)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            {/each}
          </div>
        {/if}
      {:else if loadingCharacters}
        <div class="mb-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onclick={importCharacter}>Import character</Button>
        </div>

        <div
          class="grid place-items-center rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground"
        >
          Loading characters...
        </div>
      {:else if filteredCharacters.length === 0}
        <div class="mb-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onclick={importCharacter}>Import character</Button>
        </div>

        <div
          class="grid place-items-center rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground"
        >
          {#if storyCharacters.length === 0}
            <div class="space-y-1">
              <p>No characters from stories yet.</p>
              <p class="text-xs text-muted-foreground/80">Finish a story to reuse its character here.</p>
            </div>
          {:else}
            <div class="space-y-1">
              <p>No characters found.</p>
              <p class="text-xs text-muted-foreground/80">Try a different search.</p>
            </div>
          {/if}
        </div>
      {:else}
        <div class="mb-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onclick={importCharacter}>Import character</Button>
        </div>

        <div class="grid gap-3" role="list" aria-label="Characters">
          {#each filteredCharacters as group (group.id)}
            <Card class="group">
              <div class="flex items-start gap-2 p-3">
                <Button
                  type="button"
                  variant="ghost"
                  class="h-auto min-w-0 flex-1 flex-col items-start justify-start gap-0 p-0 text-left hover:bg-transparent"
                  onclick={() => openCharSheetForCharacter(group.id)}
                >
                  <div class="flex items-center gap-3">
                    {#if group.card?.avatar}
                      <img class="h-10 w-10 rounded-full border object-cover" src={group.card.avatar} alt="" />
                    {:else}
                      <div class="h-10 w-10 rounded-full border bg-muted" aria-hidden="true"></div>
                    {/if}
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold">{group.character.name}</div>
                      <div class="mt-0.5 text-xs text-muted-foreground">
                        {group.character.gender} · {group.character.race}
                      </div>
                    </div>
                  </div>

                  <div class="mt-2 text-xs text-muted-foreground">
                    {[...group.character.personality_traits, ...group.character.quirks, ...group.character.perks].join(
                      ", ",
                    ) || "No traits"}
                  </div>

                  {#if group.stories.length > 0}
                    <div class="mt-2 text-xs text-muted-foreground">
                      {group.stories.length} stories · Last played
                      {relativeTime(new Date(characterLastPlayedMs(group)).toISOString())}
                    </div>
                  {:else}
                    <div class="mt-2 text-xs text-muted-foreground">No stories yet</div>
                  {/if}

                  {#if group.stories.length > 0}
                    <div class="mt-3 flex flex-wrap gap-1.5" aria-label="Recent stories">
                      {#each group.stories
                        .slice()
                        .sort((a, b) => updatedAtMs(b.updated_at) - updatedAtMs(a.updated_at))
                        .slice(0, 4) as s (s.id)}
                        <Badge variant="outline" class="px-2 py-0 text-[11px] font-medium">
                          {s.title}
                        </Badge>
                      {/each}
                      {#if group.stories.length > 4}
                        <Badge variant="outline" class="px-2 py-0 text-[11px] font-medium text-muted-foreground">
                          +{group.stories.length - 4}
                        </Badge>
                      {/if}
                    </div>
                  {/if}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    class="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <span class="sr-only">Character options</span>
                    <IconDots size={15} strokeWidth={1.8} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-48">
                    <DropdownMenuItem onSelect={() => openCharSheetForCharacter(group.id)}>
                      <span class="inline-flex items-center gap-2">
                        <IconDocument size={14} strokeWidth={1.6} />
                        Details
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => startNewWithCharacter(group)}>New Story</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => void exportCharacter(group, "tavern-card")}
                      >Export ST</DropdownMenuItem
                    >
                    <DropdownMenuItem onSelect={() => void exportCharacter(group, "neuradventure")}
                      >Export JSON</DropdownMenuItem
                    >
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      class="text-destructive focus:text-destructive"
                      onSelect={() => deleteCharacter(group.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {#if group.stories.length > 0}
                <div class="border-t px-3 py-3">
                  <details class="rounded-md border bg-muted/30 p-3">
                    <summary
                      class="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Stories <span class="ml-1 rounded-full bg-background px-2 py-0.5 text-[11px]"
                        >{group.stories.length}</span
                      >
                    </summary>
                    <div class="mt-3 grid gap-1">
                      {#each group.stories
                        .slice()
                        .sort((a, b) => updatedAtMs(b.updated_at) - updatedAtMs(a.updated_at)) as s (s.id)}
                        <Button
                          type="button"
                          variant="link"
                          class="h-auto justify-start p-0 text-left text-sm font-normal text-foreground/90 hover:underline"
                          onclick={() => openStoryById(s.id)}
                        >
                          {s.title}
                        </Button>
                      {/each}
                    </div>
                  </details>
                </div>
              {/if}
            </Card>
          {/each}
        </div>
      {/if}
    </div>
  </ScrollArea>
</div>
