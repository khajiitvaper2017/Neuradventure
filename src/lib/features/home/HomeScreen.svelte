<script lang="ts">
  import { untrack } from "svelte"
  import { stories as storiesService } from "@/services/stories"
  import { chats as chatsService } from "@/services/chats"
  import type { StoryMeta, ChatSummary } from "@/shared/types"
  import type { StoryCharacterGroup, CharacterImportResult } from "@/shared/api-types"
  import { navigate, openCharSheetForCharacter } from "@/stores/router"
  import { showError, showConfirm, showQuietNotice } from "@/stores/ui"
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
  import * as Empty from "@/components/ui/empty"
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
  import { relativeTimeAgo, utcDateMs } from "@/utils/date"
  import ThemeToggle from "@/components/controls/ThemeToggle.svelte"
  import CharacterCard from "@/features/home/CharacterCard.svelte"
  import { pickFile, readFileAsDataUrl } from "@/utils/filePick"
  import { Book, Cog, EllipsisVertical, User, Users } from "@lucide/svelte"

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

  $effect(() => {
    untrack(() => {
      loadStories()
      loadCharacters()
      loadChats()
    })
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

  function matchesQuery(value: string, q: string): boolean {
    return value.toLowerCase().includes(q)
  }

  function characterLastPlayedMs(group: StoryCharacterGroup): number {
    let max = 0
    for (const s of group.stories) max = Math.max(max, utcDateMs(s.updated_at))
    return max
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
        return utcDateMs(b.updated_at) - utcDateMs(a.updated_at)
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
        return utcDateMs(b.updated_at) - utcDateMs(a.updated_at)
      }),
  )

  const filteredCharacters = $derived(
    storyCharacters
      .filter((g) => {
        if (!q) return true
        const traits = [...g.character.personality_traits, ...g.character.perks].join(" ")
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
    <div class="absolute right-3 top-3">
      <Button variant="outline" size="icon" onclick={() => navigate("settings")} aria-label="Settings" title="Settings">
        <Cog size={17} strokeWidth={1.8} aria-hidden="true" />
      </Button>
    </div>
  </header>

  <div class="grid gap-2 border-b px-4 py-3 grid-cols-3">
    <Button variant="outline" onclick={startNew} class="justify-center">
      <Book size={14} strokeWidth={2.5} aria-hidden="true" />
      New Story
    </Button>
    <Button variant="outline" onclick={startNewCharacter} class="justify-center">
      <User size={14} strokeWidth={2.5} aria-hidden="true" />
      New Character
    </Button>
    <Button variant="outline" onclick={startNewChat} class="justify-center">
      <Users size={14} strokeWidth={2.5} aria-hidden="true" />
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
        {#if stories.length > 0}
          <div class="mb-3 flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onclick={importStory}>Import story</Button>
          </div>
        {/if}

        {#if loading}
          <Empty.Root class="border p-8">
            <Empty.Header>
              <Empty.Media variant="icon">
                <Book aria-hidden="true" />
              </Empty.Media>
              <Empty.Title>Loading stories…</Empty.Title>
            </Empty.Header>
          </Empty.Root>
        {:else if filteredStories.length === 0}
          <Empty.Root class="border p-8">
            <Empty.Header>
              <Empty.Media variant="icon">
                <Book aria-hidden="true" />
              </Empty.Media>
              {#if stories.length === 0}
                <Empty.Title>No stories yet</Empty.Title>
                <Empty.Description>Begin a new adventure above.</Empty.Description>
              {:else}
                <Empty.Title>No stories found</Empty.Title>
                <Empty.Description>Try a different search.</Empty.Description>
              {/if}
            </Empty.Header>
            {#if stories.length === 0}
              <Empty.Content>
                <div class="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                  <Button class="w-full sm:w-auto" onclick={startNew}>Create new story</Button>
                  <Button variant="outline" class="w-full sm:w-auto" onclick={importStory}>Import story</Button>
                </div>
              </Empty.Content>
            {/if}
          </Empty.Root>
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
                    <div class="mt-2 text-xs text-muted-foreground">Updated {relativeTimeAgo(story.updated_at)}</div>
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      class="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <span class="sr-only">Story options</span>
                      <EllipsisVertical size={15} strokeWidth={1.8} aria-hidden="true" />
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
          <Empty.Root class="border p-8">
            <Empty.Header>
              <Empty.Media variant="icon" aria-hidden="true">
                <Users size={18} strokeWidth={2} />
              </Empty.Media>
              <Empty.Title>Loading chats…</Empty.Title>
            </Empty.Header>
          </Empty.Root>
        {:else if filteredChats.length === 0}
          <Empty.Root class="border p-8">
            <Empty.Header>
              <Empty.Media variant="icon" aria-hidden="true">
                <Users size={18} strokeWidth={2} />
              </Empty.Media>
              {#if chats.length === 0}
                <Empty.Title>No chats yet</Empty.Title>
                <Empty.Description>Start a new group chat above.</Empty.Description>
              {:else}
                <Empty.Title>No chats found</Empty.Title>
                <Empty.Description>Try a different search.</Empty.Description>
              {/if}
            </Empty.Header>
            {#if chats.length === 0}
              <Empty.Content>
                <Button class="w-full sm:w-auto" onclick={startNewChat}>Create new chat</Button>
              </Empty.Content>
            {/if}
          </Empty.Root>
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
                      {chat.message_count} messages · Updated {relativeTimeAgo(chat.updated_at)}
                    </div>
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      class="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <span class="sr-only">Chat options</span>
                      <EllipsisVertical size={15} strokeWidth={1.8} aria-hidden="true" />
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
        <Empty.Root class="border p-8">
          <Empty.Header>
            <Empty.Media variant="icon" aria-hidden="true">
              <User size={18} strokeWidth={2} />
            </Empty.Media>
            <Empty.Title>Loading characters…</Empty.Title>
          </Empty.Header>
        </Empty.Root>
      {:else if filteredCharacters.length === 0}
        {#if storyCharacters.length > 0}
          <div class="mb-3 flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onclick={importCharacter}>Import character</Button>
          </div>
        {/if}

        <Empty.Root class="border p-8">
          <Empty.Header>
            <Empty.Media variant="icon" aria-hidden="true">
              <User size={18} strokeWidth={2} />
            </Empty.Media>
            {#if storyCharacters.length === 0}
              <Empty.Title>No characters from stories yet</Empty.Title>
              <Empty.Description>Finish a story to reuse its character here.</Empty.Description>
            {:else}
              <Empty.Title>No characters found</Empty.Title>
              <Empty.Description>Try a different search.</Empty.Description>
            {/if}
          </Empty.Header>
          {#if storyCharacters.length === 0}
            <Empty.Content>
              <div class="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                <Button class="w-full sm:w-auto" onclick={startNewCharacter}>Create new character</Button>
                <Button variant="outline" class="w-full sm:w-auto" onclick={importCharacter}>Import character</Button>
              </div>
            </Empty.Content>
          {/if}
        </Empty.Root>
      {:else}
        <div class="mb-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onclick={importCharacter}>Import character</Button>
        </div>

        <div class="grid gap-3" role="list" aria-label="Characters">
          {#each filteredCharacters as group (group.id)}
            <CharacterCard
              {group}
              onOpenDetails={openCharSheetForCharacter}
              onStartNewStory={startNewWithCharacter}
              onOpenStory={openStoryById}
              onExport={exportCharacter}
              onDelete={deleteCharacter}
            />
          {/each}
        </div>
      {/if}
    </div>
  </ScrollArea>
</div>
