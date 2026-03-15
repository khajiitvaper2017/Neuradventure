<script lang="ts">
  import { navigate } from "@/stores/ui"
  import SegmentedTabs from "@/components/controls/SegmentedTabs.svelte"
  import AppearanceTab from "@/features/settings/tabs/AppearanceTab.svelte"
  import GenerationTab from "@/features/settings/tabs/GenerationTab.svelte"
  import ModulesTab from "@/features/settings/tabs/ModulesTab.svelte"
  import PromptsTab from "@/features/settings/tabs/PromptsTab.svelte"

  type SettingsTab = "appearance" | "generation" | "prompts" | "modules"
  const SETTINGS_TAB_KEY = "settings_active_tab"
  type GenerationSection = "connection" | "defaults" | "params" | "advanced"
  const GEN_SECTION_KEY = "settings_generation_section"

  function loadInitialTab(): SettingsTab {
    if (typeof window === "undefined") return "appearance"
    try {
      const stored = window.localStorage.getItem(SETTINGS_TAB_KEY)
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

<div class="screen settings">
  <header class="screen-header">
    <button class="back-btn" onclick={() => navigate("home")}>← Back</button>
    <h2 class="screen-title">Settings</h2>
  </header>

  <div class="settings-tabs">
    <SegmentedTabs ariaLabel="Settings tabs" {tabs} bind:value={activeTab} variant="nav" stretch />
  </div>

  {#if activeTab === "generation"}
    <div class="settings-subtabs">
      <SegmentedTabs
        ariaLabel="Text generation sections"
        tabs={generationSectionTabs}
        bind:value={generationSection}
        variant="nav"
        stretch
      />
    </div>
  {/if}

  <div class="settings-body" data-scroll-root="screen">
    <div class="settings-pane" hidden={activeTab !== "appearance"} aria-hidden={activeTab !== "appearance"}>
      <AppearanceTab />
      <div class="settings-bottom-pad"></div>
    </div>

    <div class="settings-pane" hidden={activeTab !== "generation"} aria-hidden={activeTab !== "generation"}>
      <GenerationTab active={activeTab === "generation"} section={generationSection} />
    </div>

    <div class="settings-pane" hidden={activeTab !== "prompts"} aria-hidden={activeTab !== "prompts"}>
      <PromptsTab active={activeTab === "prompts"} />
    </div>

    <div class="settings-pane" hidden={activeTab !== "modules"} aria-hidden={activeTab !== "modules"}>
      <ModulesTab />
    </div>
  </div>
</div>

<style>
  .settings-tabs {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  .settings-subtabs {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  .settings-body {
    flex: 1;
    overflow-y: auto;
  }
</style>
