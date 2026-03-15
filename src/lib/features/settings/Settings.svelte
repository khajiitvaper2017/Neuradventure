<script lang="ts">
  import { navigate } from "@/stores/ui"
  import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
  import { Button } from "@/components/ui/button"
  import { ScrollArea } from "@/components/ui/scroll-area"
  import AppearanceTab from "@/features/settings/tabs/AppearanceTab.svelte"
  import DataTab from "@/features/settings/tabs/DataTab.svelte"
  import GenerationTab from "@/features/settings/tabs/GenerationTab.svelte"
  import ModulesTab from "@/features/settings/tabs/ModulesTab.svelte"
  import PromptsTab from "@/features/settings/tabs/PromptsTab.svelte"

  type SettingsTab = "appearance" | "data" | "generation" | "prompts" | "modules"
  const SETTINGS_TAB_KEY = "settings_active_tab"
  type GenerationSection = "connection" | "defaults" | "params" | "advanced"
  const GEN_SECTION_KEY = "settings_generation_section"

  function loadInitialTab(): SettingsTab {
    if (typeof window === "undefined") return "appearance"
    try {
      const stored = window.localStorage.getItem(SETTINGS_TAB_KEY)
      if (stored === "data") return "data"
      if (stored === "generation") return "generation"
      if (stored === "prompts") return "prompts"
      if (stored === "modules") return "modules"
      return "appearance"
    } catch {
      return "appearance"
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
    { value: "appearance", label: "Appearance" },
    { value: "data", label: "Data" },
    { value: "generation", label: "Text Generation" },
    { value: "prompts", label: "Prompts" },
    { value: "modules", label: "Story Modules" },
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

  <div class="border-b px-4 py-3">
    <Tabs value={activeTab} onValueChange={(next) => (activeTab = next as SettingsTab)}>
      <TabsList aria-label="Settings tabs" class="w-full">
        {#each tabs as t (t.value)}
          <TabsTrigger value={t.value} class="flex-1 text-xs font-medium uppercase tracking-wider">
            {t.label}
          </TabsTrigger>
        {/each}
      </TabsList>
    </Tabs>
  </div>

  {#if activeTab === "generation"}
    <div class="border-b px-4 py-3">
      <Tabs value={generationSection} onValueChange={(next) => (generationSection = next as GenerationSection)}>
        <TabsList aria-label="Text generation sections" class="w-full">
          {#each generationSectionTabs as t (t.value)}
            <TabsTrigger value={t.value} class="flex-1 text-xs font-medium uppercase tracking-wider">
              {t.label}
            </TabsTrigger>
          {/each}
        </TabsList>
      </Tabs>
    </div>
  {/if}

  <ScrollArea class="min-h-0 flex-1">
    <div class="px-4 py-4">
      <div class="space-y-4" hidden={activeTab !== "appearance"} aria-hidden={activeTab !== "appearance"}>
        <AppearanceTab />
      </div>

      <div class="space-y-4" hidden={activeTab !== "data"} aria-hidden={activeTab !== "data"}>
        <DataTab />
      </div>

      <div class="space-y-4" hidden={activeTab !== "generation"} aria-hidden={activeTab !== "generation"}>
        <GenerationTab active={activeTab === "generation"} section={generationSection} />
      </div>

      <div class="space-y-4" hidden={activeTab !== "prompts"} aria-hidden={activeTab !== "prompts"}>
        <PromptsTab active={activeTab === "prompts"} />
      </div>

      <div class="space-y-4" hidden={activeTab !== "modules"} aria-hidden={activeTab !== "modules"}>
        <ModulesTab />
      </div>
    </div>
  </ScrollArea>
</div>
