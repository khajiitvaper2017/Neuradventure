<script lang="ts">
  import { navigate } from "@/stores/router"
  import * as Tabs from "@/components/ui/tabs/index.js"
  import { Button } from "@/components/ui/button"
  import { ScrollArea } from "@/components/ui/scroll-area"
  import DataTab from "@/features/settings/tabs/DataTab.svelte"
  import GenerationTab from "@/features/settings/tabs/GenerationTab.svelte"
  import ModulesTab from "@/features/settings/tabs/ModulesTab.svelte"
  import PromptsTab from "@/features/settings/tabs/PromptsTab.svelte"

  type SettingsTab = "data" | "generation" | "prompts" | "modules"
  const SETTINGS_TAB_KEY = "settings_active_tab"
  type GenerationSection = "connection" | "defaults" | "params" | "advanced"
  const GEN_SECTION_KEY = "settings_generation_section"

  function loadInitialTab(): SettingsTab {
    if (typeof window === "undefined") return "data"
    try {
      const stored = window.localStorage.getItem(SETTINGS_TAB_KEY)
      if (stored === "appearance") return "data"
      if (stored === "data") return "data"
      if (stored === "generation") return "generation"
      if (stored === "prompts") return "prompts"
      if (stored === "modules") return "modules"
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

  $effect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(SETTINGS_TAB_KEY, activeTab)
    } catch {
      // Ignore storage failures (e.g., privacy mode).
    }
  })

  $effect(() => {
    if (activeTab !== "generation") return
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(GEN_SECTION_KEY, generationSection)
    } catch {
      // ignore
    }
  })

  const tabs: Array<{ value: SettingsTab; label: string }> = [
    { value: "data", label: "Data" },
    { value: "generation", label: "LLM" },
    { value: "prompts", label: "Prompts" },
    { value: "modules", label: "Modules" },
  ]

  const generationSectionTabs: Array<{ value: GenerationSection; label: string }> = [
    { value: "connection", label: "Connection" },
    { value: "defaults", label: "Defaults" },
    { value: "params", label: "Params" },
    { value: "advanced", label: "Advanced" },
  ]
</script>

<div class="mx-auto flex h-dvh w-full max-w-3xl flex-col">
  <header class="flex items-center gap-3 border-b px-4 py-3">
    <Button variant="ghost" class="-ml-2" onclick={() => navigate("home")}>← Back</Button>
    <h2 class="text-base font-semibold text-foreground">Settings</h2>
  </header>

  <Tabs.Root value={activeTab} onValueChange={(next) => (activeTab = next as SettingsTab)} class="min-h-0 flex-1 gap-0">
    <div class="border-b px-4 py-3">
      <Tabs.List
        aria-label="Settings tabs"
        class="w-full justify-start overflow-x-auto overflow-y-hidden sm:justify-center sm:overflow-x-visible"
      >
        {#each tabs as t (t.value)}
          <Tabs.Trigger
            value={t.value}
            class="min-w-max flex-1 px-3 text-xs font-medium uppercase tracking-wider sm:min-w-0 sm:px-2"
          >
            {t.label}
          </Tabs.Trigger>
        {/each}
      </Tabs.List>
    </div>

    {#if activeTab === "generation"}
      <div class="border-b px-4 py-3">
        <Tabs.Root value={generationSection} onValueChange={(next) => (generationSection = next as GenerationSection)}>
          <Tabs.List
            aria-label="Text generation sections"
            class="w-full justify-start overflow-x-auto overflow-y-hidden sm:justify-center sm:overflow-x-visible"
          >
            {#each generationSectionTabs as t (t.value)}
              <Tabs.Trigger
                value={t.value}
                class="min-w-max flex-1 px-3 text-xs font-medium uppercase tracking-wider sm:min-w-0 sm:px-2"
              >
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

        <Tabs.Content value="prompts">
          <div class="space-y-4">
            <PromptsTab active={activeTab === "prompts"} />
          </div>
        </Tabs.Content>

        <Tabs.Content value="modules">
          <div class="space-y-4">
            <ModulesTab />
          </div>
        </Tabs.Content>
      </div>
    </ScrollArea>
  </Tabs.Root>
</div>
