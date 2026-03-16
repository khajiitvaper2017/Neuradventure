<script lang="ts">
  import promptFields from "@/shared/config/prompt-fields.json"
  import { settings as settingsService } from "@/services/settings"
  import FieldPromptOverridesCard from "@/features/settings/components/FieldPromptOverridesCard.svelte"
  import PromptTemplatesCard from "@/features/settings/components/PromptTemplatesCard.svelte"

  type Props = { active?: boolean }
  let { active = false }: Props = $props()

  const builtins = promptFields as Record<string, string>
  const CHAT_FIELD_PREFIXES = ["generation.chat.", "chat."] as const

  const chatFieldKeys = Object.keys(builtins)
    .filter((k) => CHAT_FIELD_PREFIXES.some((p) => k.startsWith(p)))
    .sort((a, b) => a.localeCompare(b))

  let overrides = $state<Record<string, string>>({})
  let overridesLoadedOnce = $state(false)
  let overridesLoading = $state(false)

  $effect(() => {
    if (!active) return
    if (overridesLoadedOnce) return
    if (overridesLoading) return

    overridesLoading = true
    void (async () => {
      try {
        overrides = await settingsService.fieldPromptOverrides()
        overridesLoadedOnce = true
      } catch (err) {
        console.error("[field-prompts] Failed to load overrides", err)
      } finally {
        overridesLoading = false
      }
    })()
  })
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
    keys={chatFieldKeys}
    {builtins}
    {overrides}
    onOverridesUpdated={(next) => (overrides = next)}
    showResetAll={false}
    idBase="chat-field-prompt-overrides"
  />
</div>
