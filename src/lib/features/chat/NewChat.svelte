<script lang="ts">
  import { untrack } from "svelte"
  import type { StoryCharacterGroup, StoryNpcGroup } from "@/types/api"
  import { stories as storiesService } from "@/services/stories"
  import { chats } from "@/services/chats"
  import { subscribeStreamPreview } from "@/services/streamPreview"
  import { goBack, navigate, openCharSheetForCharacter } from "@/stores/router"
  import { showError } from "@/stores/ui"
  import { resetChat } from "@/stores/chat"
  import { loadPromptHistory, savePromptHistory, removePromptHistory } from "@/utils/promptHistory"
  import { createRequestId } from "@/utils/ids"
  import { clearPendingRequest, getPendingRequest, setPendingRequest } from "@/utils/pendingRequests"
  import { cn } from "@/utils.js"
  import { FileText } from "@lucide/svelte"
  import PromptHistoryPanel from "@/components/panels/PromptHistoryPanel.svelte"
  import MultiSelectPicker from "@/components/pickers/MultiSelectPicker.svelte"
  import * as Select from "@/components/ui/select"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"
  import { Textarea } from "@/components/ui/textarea"
  import { ScrollArea } from "@/components/ui/scroll-area"
  import { generateChatFromDescription } from "@/features/chat/actions"
  import { streamingEnabled } from "@/stores/settings"

  let title = $state("")
  let description = $state("")
  let greeting = $state("")
  let loading = $state(false)
  let submitting = $state(false)
  let generating = $state(false)
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
  let greetingTemplateLabel = $derived(
    greetingTemplateOptions.find((o) => o.value === seedGreetingIndex)?.label ?? "Greeting 1 (first_mes)",
  )

  const CHAT_PROMPT_HISTORY_KEY = "na:prompt_history:chat"

  type PlayableOption = {
    key: string
    kind: "character" | "npc"
    name: string
    character_id: number | null
    avatar?: string | null
    state: Omit<StoryCharacterGroup["character"], "inventory"> | Omit<StoryNpcGroup["npc"], "inventory">
    description: string
  }

  $effect(() => {
    untrack(() => {
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
      avatar: c.card?.avatar ?? null,
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
      avatar: null,
      state: n.npc,
      description: `${n.npc.race || "Unknown"} · ${n.npc.gender || "Unknown"} · ${formatStoryLabel(n.stories)}`,
    })),
  ])

  function optionByKey(key: string | null): PlayableOption | null {
    if (!key) return null
    return playableOptions.find((o) => o.key === key) ?? null
  }

  let hasPlayableOptions = $derived(playableOptions.length > 0)

  function selectPlayer(key: string) {
    playerKey = key
    aiKeys = aiKeys.filter((k) => k !== key)
    maybeAutofillTitle()
    void refreshGreeting()
  }

  function setAiMemberKeys(nextKeys: string[]) {
    const unique = Array.from(new Set(nextKeys))
    aiKeys = playerKey ? unique.filter((k) => k !== playerKey) : unique
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
  let playerSelectOptions = $derived(
    playableOptions.map((o) => ({
      value: o.key,
      label: `${o.name}${o.kind === "npc" ? " (NPC)" : ""}`,
    })),
  )
  let aiMemberItems = $derived(
    playableOptions.map((o) => ({
      id: o.key,
      name: o.name,
      description: o.description,
      avatar: o.kind === "character" ? (o.avatar ?? null) : null,
      tag: o.kind === "npc" ? "NPC" : undefined,
      details: o.kind === "character" && !!o.character_id,
      detailsTitle: "Details",
      detailsAriaLabel: `Character details for ${o.name}`,
    })),
  )

  function openAiMemberDetails(item: { id: string }) {
    const option = optionByKey(item.id)
    if (!option || option.kind !== "character" || !option.character_id) return
    openCharSheetForCharacter(option.character_id)
  }

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
      ? subscribeStreamPreview(requestId, (patch) => {
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

<div class="mx-auto flex h-dvh w-full max-w-3xl flex-col">
  <header class="flex items-center gap-3 border-b px-4 py-3">
    <Button variant="ghost" class="-ml-2" onclick={() => goBack("home")} aria-label="Back">← Back</Button>
    <h2 class="text-base font-semibold text-foreground">New Chat</h2>
  </header>

  <ScrollArea class="min-h-0 flex-1">
    <div class="px-4 py-4">
      <div class="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Generate from description</CardTitle>
            <CardDescription>Optional: generate a title, greeting, and members from a prompt.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="flex items-start gap-2">
              <Textarea
                id="chat-generate"
                bind:value={description}
                placeholder="e.g. a tense council meeting in a storm-battered keep"
                rows={2}
              />
              <Button variant="outline" class="shrink-0" onclick={generateFromDescription} disabled={!canGenerate}>
                {generating ? "Generating..." : "✦ Generate"}
              </Button>
            </div>
            <PromptHistoryPanel items={chatPromptHistory} onUse={useChatPrompt} onDelete={deleteChatPrompt} />
          </CardContent>
        </Card>

        <div class="space-y-2">
          <Label for="chat-title">Title</Label>
          <Input
            id="chat-title"
            type="text"
            bind:value={title}
            placeholder="e.g. Fireside Council"
            oninput={() => (titleWasAutofilled = false)}
          />
        </div>

        {#if greetingLoading}
          <div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Loading character greetings...</div>
        {:else if greetingOptions.length > 0}
          <div class="space-y-2">
            <Label for="greeting-template-select">Greeting Template (SillyTavern)</Label>
            <Select.Root
              type="single"
              value={String(seedGreetingIndex)}
              onValueChange={(next) => {
                seedGreetingIndex = Number(next)
                greeting = greetingOptions[seedGreetingIndex] ?? greeting
              }}
            >
              <Select.Trigger id="greeting-template-select" class="w-full" aria-label="Greeting template">
                {greetingTemplateLabel}
              </Select.Trigger>
              <Select.Content>
                {#each greetingTemplateOptions as option (option.value)}
                  <Select.Item value={String(option.value)} label={option.label} />
                {/each}
              </Select.Content>
            </Select.Root>
            <div class="text-xs text-muted-foreground">Selecting a template fills the greeting text below.</div>
          </div>
        {/if}

        <div class="space-y-2">
          <Label for="chat-greeting">Greeting</Label>
          <Textarea
            id="chat-greeting"
            rows={4}
            bind:value={greeting}
            placeholder="Seeds the first AI message to start the chat."
          />
          <div class="text-xs text-muted-foreground">
            Supports placeholders: {"{{user}}"} (player), {"{{char}}"} (AI speaker).
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Player</CardTitle>
            <CardDescription>Pick a character from stories. Create a new one anytime.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            {#if loading}
              <div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Loading characters…</div>
            {:else if !hasPlayableOptions}
              <div class="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
                No characters yet.
              </div>
            {:else}
              <div class="flex flex-wrap items-center gap-2">
                <div class="min-w-[14rem] flex-1">
                  <Select.Root
                    type="single"
                    value={playerKey ?? ""}
                    items={playerSelectOptions}
                    disabled={generating || submitting || loading || !hasPlayableOptions}
                    onValueChange={(next) => selectPlayer(next)}
                  >
                    <Select.Trigger
                      class="w-full"
                      aria-label="Player character"
                      data-placeholder={!playerKey ? true : undefined}
                    >
                      {playerKey
                        ? (playerSelectOptions.find((o) => o.value === playerKey)?.label ?? playerKey)
                        : "Select a character…"}
                    </Select.Trigger>
                    <Select.Content>
                      {#each playerSelectOptions as option (option.value)}
                        <Select.Item {...option} />
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
                <Button variant="outline" onclick={() => navigate("char-create")} disabled={generating || submitting}
                  >New</Button
                >
                <Button
                  variant="outline"
                  onclick={() => {
                    if (!selectedPlayerCharId) return
                    openCharSheetForCharacter(selectedPlayerCharId)
                  }}
                  disabled={generating || submitting || !selectedPlayerCharId}
                  title={selectedPlayerCharId ? "Character details" : "Details available for story characters only"}
                >
                  <FileText size={16} strokeWidth={1.6} aria-hidden="true" />
                  Details
                </Button>
                <Button variant="outline" onclick={refreshPlayable} disabled={generating || submitting || loading}
                  >Refresh</Button
                >
              </div>
            {/if}

            {#if selectedPlayerOption}
              <div class="rounded-lg border bg-card p-4">
                <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Player Character</div>
                <div class="mt-2 text-lg font-semibold text-foreground">{selectedPlayerOption.name}</div>
                <div class="mt-1 text-sm text-muted-foreground">
                  {selectedPlayerOption.state.gender || "Unknown"} ·
                  {[...selectedPlayerOption.state.personality_traits, ...selectedPlayerOption.state.perks].join(", ") ||
                    "No traits"}
                </div>
              </div>
            {:else}
              <div class="rounded-lg border border-dashed bg-card p-4">
                <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Player Character</div>
                <div class="mt-2 text-sm text-muted-foreground">No player selected yet.</div>
                <Button class="mt-3" onclick={() => navigate("char-create")} disabled={generating || submitting}
                  >New Character</Button
                >
              </div>
            {/if}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Members</CardTitle>
            <CardDescription>Select at least one AI member for the chat.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            {#if loading}
              <div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Loading characters…</div>
            {:else if playableOptions.length === 0}
              <div class="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
                No members available yet.
              </div>
            {:else}
              <MultiSelectPicker
                bare
                showHeader={false}
                title="AI Members"
                ariaLabel="AI members"
                items={aiMemberItems}
                selectedIds={aiKeys}
                excludeIds={playerKey ? [playerKey] : []}
                excludeBadgeLabel="Player"
                locked={generating || submitting}
                searchPlaceholder="Search members…"
                emptyText="No members available yet."
                onChange={setAiMemberKeys}
                onDetails={openAiMemberDetails}
              />
            {/if}
            {#if playerKey && aiKeys.length === 0}
              <div class="text-xs text-muted-foreground">Select at least one AI member.</div>
            {/if}
          </CardContent>
        </Card>
      </div>
    </div>
  </ScrollArea>

  <div class="border-t px-4 py-4">
    <Button class="w-full" onclick={startChat} disabled={!canSubmit}>
      {submitting ? "Creating..." : "Start Chat →"}
    </Button>
  </div>
</div>
