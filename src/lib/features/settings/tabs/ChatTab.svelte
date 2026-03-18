<script lang="ts">
  import FieldPromptOverridesCard from "@/features/settings/components/FieldPromptOverridesCard.svelte"
  import PromptTemplatesCard from "@/features/settings/components/PromptTemplatesCard.svelte"
  import { CHAT_FIELD_PREFIXES, getFieldDescriptionMap, listFieldKeysWithPrefixes } from "@/llm/contract/descriptions"

  type Props = { active?: boolean }
  let { active = false }: Props = $props()

  const builtins = getFieldDescriptionMap()
  const chatFieldKeys = listFieldKeysWithPrefixes(builtins, CHAT_FIELD_PREFIXES)
</script>

<div class="space-y-4">
  <PromptTemplatesCard
    allowedNames={["chat-prompt-lines", "chat-setup"]}
    title="Chat Prompt Template"
    description="Edit chat prompt templates stored in SQLite. Changes affect future generations immediately."
  />

  <FieldPromptOverridesCard
    title="Chat Field Prompt Overrides"
    description="Overrides for chat-related prompt-fields.json keys."
    {active}
    keys={chatFieldKeys}
    {builtins}
    showResetAll={false}
    idBase="chat-field-prompt-overrides"
  />
</div>
