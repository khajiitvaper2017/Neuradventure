<script lang="ts">
  import type { StoryModules } from "@/types/types"
  import { MODULE_DEFS_BY_ID, STORY_MODULE_PROMPT_KEYS, type StoryModuleKey } from "@/domain/story/module-definitions"
  import {
    CHAT_FIELD_PREFIXES,
    getFieldDescriptionMap,
    listFieldKeysExcluding,
    listFieldKeysWithPrefixes,
  } from "@/llm/contract/descriptions"
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

  const builtins = getFieldDescriptionMap()

  const CUSTOM_FIELD_CONTAINER_KEYS = ["state.character.custom_fields", "llm.world_state_update.custom_fields"] as const
  const chatFieldKeys = listFieldKeysWithPrefixes(builtins, CHAT_FIELD_PREFIXES)
  const storyOtherKeys = listFieldKeysExcluding(builtins, [
    ...CUSTOM_FIELD_CONTAINER_KEYS,
    ...chatFieldKeys,
    ...STORY_MODULE_PROMPT_KEYS,
  ])

  function setStoryDefaults(next: StoryModules) {
    storyDefaults.set(next)
  }

  let activeModule = $state<StoryModuleKey | null>(null)
  let moduleDialogOpen = $state(false)

  function openModulePrompts(key: StoryModuleKey) {
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
      title={MODULE_DEFS_BY_ID[activeModule].title}
      sharedNote={MODULE_DEFS_BY_ID[activeModule].sharedNote ?? ""}
      keys={[...MODULE_DEFS_BY_ID[activeModule].promptKeys]}
      {builtins}
      onClose={closeModulePrompts}
    />
  {/if}
</div>
