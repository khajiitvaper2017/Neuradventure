<script lang="ts">
  import promptFields from "@/shared/config/prompt-fields.json"
  import type { StoryModules } from "@/shared/types"
  import { settings as settingsService } from "@/services/settings"
  import StoryModulesPanel from "@/components/panels/StoryModulesPanel.svelte"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import * as Tabs from "@/components/ui/tabs/index.js"
  import CustomFieldsCard from "@/features/settings/components/CustomFieldsCard.svelte"
  import FieldPromptOverridesCard from "@/features/settings/components/FieldPromptOverridesCard.svelte"
  import ModulePromptOverridesDialog from "@/features/settings/components/ModulePromptOverridesDialog.svelte"
  import PromptFormattingCard from "@/features/settings/components/PromptFormattingCard.svelte"
  import PromptTemplatesCard from "@/features/settings/components/PromptTemplatesCard.svelte"
  import { storyDefaults } from "@/stores/settings"
  import { Braces, FileText, Puzzle } from "@lucide/svelte"

  type Props = { active?: boolean }
  let { active = false }: Props = $props()

  const builtins = promptFields as Record<string, string>

  const CUSTOM_FIELD_CONTAINER_KEYS = [
    "state.character.custom_fields",
    "llm.turn_response.character_custom_fields",
    "llm.npc_update.custom_fields",
    "llm.world_state_update.custom_fields",
  ] as const

  const CHAT_FIELD_PREFIXES = ["generation.chat.", "chat."] as const
  const chatFieldKeys = Object.keys(builtins)
    .filter((k) => CHAT_FIELD_PREFIXES.some((p) => k.startsWith(p)))
    .sort((a, b) => a.localeCompare(b))

  type ModuleKey = keyof StoryModules

  const MODULE_PROMPT_KEYS: Record<ModuleKey, { title: string; sharedNote?: string; keys: string[] }> = {
    track_npcs: {
      title: "Track NPCs",
      keys: [
        "llm.turn_response.npc_changes",
        "llm.turn_response.npc_introductions",
        "llm.npc_update.entry",
        "llm.npc_update.name",
      ],
    },
    track_locations: {
      title: "Track locations",
      keys: [
        "llm.world_state_update.locations",
        "state.location.entry",
        "state.location.name",
        "state.location.description",
        "state.location.characters",
        "state.location.character",
        "state.location.available_items",
        "state.location.available_item",
      ],
    },
    track_background_events: {
      title: "Track background events",
      keys: ["llm.turn_response.background_events"],
    },
    character_appearance_clothing: {
      title: "Player appearance + clothing",
      keys: [
        "state.character.baseline_appearance",
        "state.character.current_appearance",
        "state.character.current_clothing",
      ],
    },
    character_personality_traits: {
      title: "Player personality traits",
      keys: ["traits.entry", "traits.personality_traits"],
    },
    character_major_flaws: {
      title: "Player major flaws",
      keys: ["traits.entry", "traits.major_flaws"],
    },
    character_quirks: {
      title: "Player quirks",
      keys: ["traits.entry", "traits.quirks"],
    },
    character_perks: {
      title: "Player perks",
      keys: ["traits.entry", "traits.perks"],
    },
    character_inventory: {
      title: "Player inventory",
      keys: [
        "state.character.inventory",
        "state.inventory_item.entry",
        "state.inventory_item.name",
        "state.inventory_item.description",
      ],
    },
    npc_appearance_clothing: {
      title: "NPC appearance + clothing",
      sharedNote: "Shared prompts (same descriptions used for player + NPC appearance/clothing guidance).",
      keys: [
        "state.character.baseline_appearance",
        "state.character.current_appearance",
        "state.character.current_clothing",
      ],
    },
    npc_personality_traits: {
      title: "NPC personality traits",
      sharedNote: "Shared prompts (same trait guidance used for player + NPCs).",
      keys: ["traits.entry", "traits.personality_traits"],
    },
    npc_major_flaws: {
      title: "NPC major flaws",
      sharedNote: "Shared prompts (same trait guidance used for player + NPCs).",
      keys: ["traits.entry", "traits.major_flaws"],
    },
    npc_quirks: {
      title: "NPC quirks",
      sharedNote: "Shared prompts (same trait guidance used for player + NPCs).",
      keys: ["traits.entry", "traits.quirks"],
    },
    npc_perks: {
      title: "NPC perks",
      sharedNote: "Shared prompts (same trait guidance used for player + NPCs).",
      keys: ["traits.entry", "traits.perks"],
    },
    npc_location: {
      title: "NPC location",
      keys: ["llm.npc_update.current_location"],
    },
    npc_activity: {
      title: "NPC activity",
      keys: ["llm.npc_update.current_activity", "state.character.current_activity"],
    },
  }

  const moduleKeySet = new Set(Object.values(MODULE_PROMPT_KEYS).flatMap((m) => m.keys))
  const reservedSet = new Set<string>([...CUSTOM_FIELD_CONTAINER_KEYS, ...chatFieldKeys])

  const storyOtherKeys = Object.keys(builtins)
    .filter((k) => !moduleKeySet.has(k) && !reservedSet.has(k))
    .sort((a, b) => a.localeCompare(b))

  let overrides = $state<Record<string, string>>({})
  let overridesLoadedOnce = $state(false)
  let overridesLoading = $state(false)

  async function loadOverrides() {
    if (overridesLoading) return
    overridesLoading = true
    try {
      overrides = await settingsService.fieldPromptOverrides()
      overridesLoadedOnce = true
    } catch (err) {
      console.error("[field-prompts] Failed to load overrides", err)
    } finally {
      overridesLoading = false
    }
  }

  $effect(() => {
    if (!active) return
    if (overridesLoadedOnce) return
    void loadOverrides()
  })

  function setStoryDefaults(next: StoryModules) {
    storyDefaults.set(next)
  }

  type StorySubtab = "modules" | "prompts" | "fields"
  const STORY_SUBTAB_KEY = "settings_story_subtab"

  function loadInitialSubtab(): StorySubtab {
    if (typeof window === "undefined") return "modules"
    try {
      const stored = window.localStorage.getItem(STORY_SUBTAB_KEY)
      if (stored === "modules") return "modules"
      if (stored === "prompts") return "prompts"
      if (stored === "fields") return "fields"
      return "modules"
    } catch {
      return "modules"
    }
  }

  let activeSubtab = $state<StorySubtab>(loadInitialSubtab())

  $effect(() => {
    if (!active) return
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(STORY_SUBTAB_KEY, activeSubtab)
    } catch {
      // ignore
    }
  })

  let activeModule = $state<ModuleKey | null>(null)
  let moduleDialogOpen = $state(false)

  function openModulePrompts(key: ModuleKey) {
    activeModule = key
    moduleDialogOpen = true
  }

  function closeModulePrompts() {
    moduleDialogOpen = false
  }
</script>

<div class="space-y-4">
  <Tabs.Root value={activeSubtab} onValueChange={(next) => (activeSubtab = next as StorySubtab)} class="gap-0">
    <Tabs.List
      aria-label="Story settings sections"
      class="w-full justify-start overflow-x-auto overflow-y-hidden sm:justify-center sm:overflow-x-visible"
    >
      <Tabs.Trigger
        value="modules"
        class="min-w-max flex flex-1 items-center justify-center gap-2 px-3 text-xs font-medium uppercase tracking-wider sm:min-w-0"
      >
        <Puzzle class="size-4" aria-hidden="true" />
        Modules
      </Tabs.Trigger>
      <Tabs.Trigger
        value="prompts"
        class="min-w-max flex flex-1 items-center justify-center gap-2 px-3 text-xs font-medium uppercase tracking-wider sm:min-w-0"
      >
        <FileText class="size-4" aria-hidden="true" />
        Prompts
      </Tabs.Trigger>
      <Tabs.Trigger
        value="fields"
        class="min-w-max flex flex-1 items-center justify-center gap-2 px-3 text-xs font-medium uppercase tracking-wider sm:min-w-0"
      >
        <Braces class="size-4" aria-hidden="true" />
        Fields
      </Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="modules" class="mt-4">
      <div class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Puzzle class="size-4 text-muted-foreground" aria-hidden="true" />
              Defaults
            </CardTitle>
            <CardDescription>Default story module settings for new stories.</CardDescription>
          </CardHeader>
          <CardContent>
            <StoryModulesPanel
              modules={$storyDefaults}
              setModules={setStoryDefaults}
              onOpenPrompts={openModulePrompts}
            />
          </CardContent>
        </Card>
      </div>
    </Tabs.Content>

    <Tabs.Content value="prompts" class="mt-4">
      <div class="space-y-4">
        <PromptFormattingCard />

        <PromptTemplatesCard
          allowedNames={[
            "narrative-turn",
            "story-setup",
            "npc-creation",
            "player-impersonation",
            "character-generation",
          ]}
          title="Story Prompt Templates"
          description="Edit story prompt templates stored in SQLite. Changes affect future generations immediately."
        />

        <FieldPromptOverridesCard
          title="Other Field Prompt Overrides"
          description="Override built-in JSON schema descriptions from prompt-fields.json (only keys not shown under a module)."
          keys={storyOtherKeys}
          {builtins}
          {overrides}
          onOverridesUpdated={(next) => (overrides = next)}
          showResetAll={true}
          idBase="story-other-field-prompt-overrides"
        />
      </div>
    </Tabs.Content>

    <Tabs.Content value="fields" class="mt-4">
      <div class="space-y-4">
        <CustomFieldsCard {active} />

        <FieldPromptOverridesCard
          title="Custom Field Container Prompts"
          description="Prompts for the containers used to hold custom field updates."
          keys={[...CUSTOM_FIELD_CONTAINER_KEYS]}
          {builtins}
          {overrides}
          onOverridesUpdated={(next) => (overrides = next)}
          showResetAll={false}
          idBase="custom-field-container-prompts"
        />
      </div>
    </Tabs.Content>
  </Tabs.Root>

  {#if activeModule}
    <ModulePromptOverridesDialog
      open={moduleDialogOpen}
      moduleId={activeModule}
      title={MODULE_PROMPT_KEYS[activeModule].title}
      sharedNote={MODULE_PROMPT_KEYS[activeModule].sharedNote ?? ""}
      keys={MODULE_PROMPT_KEYS[activeModule].keys}
      {builtins}
      {overrides}
      disabled={overridesLoading}
      onClose={closeModulePrompts}
      onOverridesUpdated={(next) => (overrides = next)}
    />
  {/if}
</div>
