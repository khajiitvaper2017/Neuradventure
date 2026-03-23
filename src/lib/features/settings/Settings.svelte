<script lang="ts">
  import { navigate } from "@/stores/router"
  import * as Tabs from "@/components/ui/tabs/index.js"
  import { Button } from "@/components/ui/button"
  import { ScrollArea } from "@/components/ui/scroll-area"
  import DataTab from "@/features/settings/tabs/DataTab.svelte"
  import GenerationTab from "@/features/settings/tabs/GenerationTab.svelte"
  import StoryTab, { type StorySection } from "@/features/settings/tabs/StoryTab.svelte"
  import ChatTab from "@/features/settings/tabs/ChatTab.svelte"
  import {
    ArrowLeft,
    Braces,
    Book,
    Database,
    FileSliders,
    FileText,
    MessageSquare,
    Puzzle,
    Settings,
    SlidersVertical,
    Sparkles,
    Wrench,
  } from "@lucide/svelte"

  type SettingsTab = "data" | "generation" | "story" | "chat"
  const SETTINGS_TAB_KEY = "settings_active_tab"
  type GenerationSection = "connection" | "defaults" | "params" | "advanced"
  const GEN_SECTION_KEY = "settings_generation_section"
  const STORY_SECTION_KEY = "settings_story_section"

  function loadInitialTab(): SettingsTab {
    if (typeof window === "undefined") return "data"
    try {
      const stored = window.localStorage.getItem(SETTINGS_TAB_KEY)
      if (stored === "data") return "data"
      if (stored === "generation") return "generation"
      if (stored === "story") return "story"
      if (stored === "chat") return "chat"
      return "data"
    } catch {
      return "data"
    }
  }

  let activeTab: SettingsTab = $state(loadInitialTab())

  function loadInitialSection(): GenerationSection {
    if (typeof window === "undefined") return "params"
    try {
      const stored = window.localStorage.getItem(GEN_SECTION_KEY)
      if (stored === "connection") return "connection"
      if (stored === "defaults") return "defaults"
      if (stored === "advanced") return "advanced"
      return "params"
    } catch {
      return "params"
    }
  }

  let generationSection: GenerationSection = $state(loadInitialSection())

  function loadInitialStorySection(): StorySection {
    if (typeof window === "undefined") return "modules"
    try {
      const stored = window.localStorage.getItem(STORY_SECTION_KEY)
      if (stored === "modules") return "modules"
      if (stored === "prompts") return "prompts"
      if (stored === "fields") return "fields"
      return "modules"
    } catch {
      return "modules"
    }
  }

  let storySection: StorySection = $state(loadInitialStorySection())

  function persistActiveTab(next: SettingsTab) {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(SETTINGS_TAB_KEY, next)
    } catch {
      // Ignore storage failures (e.g., privacy mode).
    }
  }

  function persistGenerationSection(next: GenerationSection) {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(GEN_SECTION_KEY, next)
    } catch {
      // Ignore storage failures (e.g., privacy mode).
    }
  }

  function persistStorySection(next: StorySection) {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(STORY_SECTION_KEY, next)
    } catch {
      // Ignore storage failures (e.g., privacy mode).
    }
  }

  const tabs: Array<{ value: SettingsTab; label: string }> = [
    { value: "data", label: "Data" },
    { value: "generation", label: "LLM" },
    { value: "story", label: "Story" },
    { value: "chat", label: "Chat" },
  ]

  const generationSectionTabs: Array<{ value: GenerationSection; label: string }> = [
    { value: "connection", label: "Connection" },
    { value: "defaults", label: "Defaults" },
    { value: "params", label: "Params" },
    { value: "advanced", label: "Advanced" },
  ]

  const storySectionTabs: Array<{ value: StorySection; label: string }> = [
    { value: "modules", label: "Modules" },
    { value: "prompts", label: "Prompts" },
    { value: "fields", label: "Fields" },
  ]
</script>

<div class="mx-auto flex h-dvh w-full max-w-3xl flex-col">
  <header class="flex items-center gap-3 border-b px-4 py-3">
    <Button variant="ghost" class="-ml-2 gap-2" onclick={() => navigate("home")}>
      <ArrowLeft class="size-4" aria-hidden="true" />
      Back
    </Button>
    <h2 class="flex items-center gap-2 text-base font-semibold text-foreground">
      <Settings class="size-4 text-muted-foreground" aria-hidden="true" />
      Settings
    </h2>
  </header>

  <Tabs.Root
    value={activeTab}
    onValueChange={(next) => {
      activeTab = next as SettingsTab
      persistActiveTab(activeTab)
    }}
    class="min-h-0 flex-1 gap-0"
  >
    <div class="border-b px-4 py-3">
      <Tabs.List
        aria-label="Settings tabs"
        class="w-full justify-start overflow-x-auto overflow-y-hidden sm:justify-center sm:overflow-x-visible"
      >
        {#each tabs as t (t.value)}
          <Tabs.Trigger
            value={t.value}
            class="min-w-max flex flex-1 items-center justify-center gap-2 px-3 text-xs font-medium uppercase tracking-wider sm:min-w-0 sm:px-2"
          >
            {#if t.value === "data"}
              <Database class="size-4" aria-hidden="true" />
            {:else if t.value === "generation"}
              <Sparkles class="size-4" aria-hidden="true" />
            {:else if t.value === "story"}
              <Book class="size-4" aria-hidden="true" />
            {:else}
              <MessageSquare class="size-4" aria-hidden="true" />
            {/if}
            {t.label}
          </Tabs.Trigger>
        {/each}
      </Tabs.List>
    </div>

    {#if activeTab === "generation"}
      <div class="border-b px-4 py-3">
        <Tabs.Root
          value={generationSection}
          onValueChange={(next) => {
            generationSection = next as GenerationSection
            persistGenerationSection(generationSection)
          }}
        >
          <Tabs.List
            aria-label="Text generation sections"
            class="w-full justify-start overflow-x-auto overflow-y-hidden sm:justify-center sm:overflow-x-visible"
          >
            {#each generationSectionTabs as t (t.value)}
              <Tabs.Trigger
                value={t.value}
                class="min-w-max flex flex-1 items-center justify-center gap-2 px-3 text-xs font-medium uppercase tracking-wider sm:min-w-0 sm:px-2"
              >
                {#if t.value === "connection"}
                  <Wrench class="size-4" aria-hidden="true" />
                {:else if t.value === "defaults"}
                  <Book class="size-4" aria-hidden="true" />
                {:else if t.value === "params"}
                  <SlidersVertical class="size-4" aria-hidden="true" />
                {:else}
                  <FileSliders class="size-4" aria-hidden="true" />
                {/if}
                {t.label}
              </Tabs.Trigger>
            {/each}
          </Tabs.List>
        </Tabs.Root>
      </div>
    {/if}

    {#if activeTab === "story"}
      <div class="border-b px-4 py-3">
        <Tabs.Root
          value={storySection}
          onValueChange={(next) => {
            storySection = next as StorySection
            persistStorySection(storySection)
          }}
        >
          <Tabs.List
            aria-label="Story settings sections"
            class="w-full justify-start overflow-x-auto overflow-y-hidden sm:justify-center sm:overflow-x-visible"
          >
            {#each storySectionTabs as t (t.value)}
              <Tabs.Trigger
                value={t.value}
                class="min-w-max flex flex-1 items-center justify-center gap-2 px-3 text-xs font-medium uppercase tracking-wider sm:min-w-0 sm:px-2"
              >
                {#if t.value === "modules"}
                  <Puzzle class="size-4" aria-hidden="true" />
                {:else if t.value === "prompts"}
                  <FileText class="size-4" aria-hidden="true" />
                {:else}
                  <Braces class="size-4" aria-hidden="true" />
                {/if}
                {t.label}
              </Tabs.Trigger>
            {/each}
          </Tabs.List>
        </Tabs.Root>
      </div>
    {/if}

    <ScrollArea class="min-h-0 flex-1">
      <div class="px-4 py-4">
        <Tabs.Content value="data">
          <div class="space-y-4">
            <DataTab />
          </div>
        </Tabs.Content>

        <Tabs.Content value="generation">
          <div class="space-y-4">
            <GenerationTab active={activeTab === "generation"} section={generationSection} />
          </div>
        </Tabs.Content>

        <Tabs.Content value="story">
          <div class="space-y-4">
            <StoryTab active={activeTab === "story"} section={storySection} />
          </div>
        </Tabs.Content>

        <Tabs.Content value="chat">
          <div class="space-y-4">
            <ChatTab active={activeTab === "chat"} />
          </div>
        </Tabs.Content>
      </div>
    </ScrollArea>
  </Tabs.Root>
</div>
