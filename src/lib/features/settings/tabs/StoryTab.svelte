<script lang="ts">
  import promptFields from "@/shared/config/prompt-fields.json"
  import type { StoryModules } from "@/shared/types"
  import StoryModulesPanel from "@/components/panels/StoryModulesPanel.svelte"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import CustomFieldsCard from "@/features/settings/components/CustomFieldsCard.svelte"
  import FieldPromptOverridesCard from "@/features/settings/components/FieldPromptOverridesCard.svelte"
  import ModulePromptOverridesDialog from "@/features/settings/components/ModulePromptOverridesDialog.svelte"
  import PromptFormattingCard from "@/features/settings/components/PromptFormattingCard.svelte"
  import PromptTemplatesCard from "@/features/settings/components/PromptTemplatesCard.svelte"
  import { storyDefaults } from "@/stores/settings"
  import { Puzzle } from "@lucide/svelte"

  export type StorySection = "modules" | "prompts" | "fields"

  type Props = {
    active?: boolean
    section: StorySection
  }
  let { active = false, section }: Props = $props()

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

  function setStoryDefaults(next: StoryModules) {
    storyDefaults.set(next)
  }

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
  {#if section === "modules"}
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
          <StoryModulesPanel modules={$storyDefaults} setModules={setStoryDefaults} onOpenPrompts={openModulePrompts} />
        </CardContent>
      </Card>
    </div>
  {:else if section === "prompts"}
    <div class="space-y-4">
      <PromptFormattingCard />

      <PromptTemplatesCard
        allowedNames={["narrative-turn", "story-setup", "npc-creation", "player-impersonation", "character-generation"]}
        title="Story Prompt Templates"
        description="Edit story prompt templates stored in SQLite. Changes affect future generations immediately."
      />

      <FieldPromptOverridesCard
        title="Other Field Prompt Overrides"
        description="Override built-in JSON schema descriptions from prompt-fields.json (only keys not shown under a module)."
        {active}
        keys={storyOtherKeys}
        {builtins}
        layout="stacked"
        showResetAll={true}
        idBase="story-other-field-prompt-overrides"
      />
    </div>
  {:else}
    <div class="space-y-4">
      <CustomFieldsCard {active} />

      <FieldPromptOverridesCard
        title="Custom Field Container Prompts"
        description="Prompts for the containers used to hold custom field updates."
        {active}
        keys={[...CUSTOM_FIELD_CONTAINER_KEYS]}
        {builtins}
        layout="stacked"
        showResetAll={false}
        idBase="custom-field-container-prompts"
      />
    </div>
  {/if}

  {#if activeModule}
    <ModulePromptOverridesDialog
      open={moduleDialogOpen}
      moduleId={activeModule}
      title={MODULE_PROMPT_KEYS[activeModule].title}
      sharedNote={MODULE_PROMPT_KEYS[activeModule].sharedNote ?? ""}
      keys={MODULE_PROMPT_KEYS[activeModule].keys}
      {builtins}
      onClose={closeModulePrompts}
    />
  {/if}
</div>
