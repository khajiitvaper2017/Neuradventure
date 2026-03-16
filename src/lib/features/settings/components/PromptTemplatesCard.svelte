<script lang="ts">
  import { onMount } from "svelte"
  import { settings as settingsService } from "@/services/settings"
  import type { PromptTemplateFile } from "@/shared/api-types"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import * as InputGroup from "@/components/ui/input-group"
  import { Label } from "@/components/ui/label"
  import * as Tabs from "@/components/ui/tabs/index.js"
  import { FileText } from "@lucide/svelte"

  type Props = {
    allowedNames: PromptTemplateFile["name"][]
    title?: string
    description?: string
  }

  let { allowedNames, title = "Prompt Templates", description = "Edit text stored in SQLite." }: Props = $props()

  const derivedIdBase = $derived(
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "prompt-templates",
  )
  const templateId = $derived(`${derivedIdBase}-template-text`)

  const PROMPT_LABELS: Record<PromptTemplateFile["name"], string> = {
    "narrative-turn": "Narrative Turn",
    "character-generation": "Character Generation",
    "story-setup": "Story Setup",
    "chat-prompt-lines": "Chat Prompt",
    "chat-setup": "Chat Setup",
    "npc-creation": "NPC Creation",
    "player-impersonation": "Player Impersonation",
  }

  let promptFiles = $state<PromptTemplateFile[]>([])
  let promptSelected = $state<PromptTemplateFile["name"] | null>(null)
  let promptDraft = $state<string>("")
  let promptDirty = $state(false)
  let promptLoading = $state(false)
  let promptSaving = $state(false)
  let promptError = $state<string | null>(null)

  const promptSelectedRow = $derived(
    promptSelected ? (promptFiles.find((p) => p.name === promptSelected) ?? null) : null,
  )

  function allowedSet(): Set<PromptTemplateFile["name"]> {
    return new Set(allowedNames)
  }

  function sortByAllowed(names: PromptTemplateFile[]): PromptTemplateFile[] {
    const byName = new Map(names.map((n) => [n.name, n]))
    const out: PromptTemplateFile[] = []
    for (const name of allowedNames) {
      const row = byName.get(name)
      if (row) out.push(row)
    }
    return out
  }

  async function loadPromptFiles(options?: { preserveSelection?: boolean }) {
    if (promptLoading) return
    const prevSelected = options?.preserveSelection ? promptSelected : null
    promptLoading = true
    promptError = null
    try {
      const rows = await settingsService.promptTemplates()
      const filtered = rows.filter((r) => allowedSet().has(r.name))
      promptFiles = sortByAllowed(filtered)

      const preferred = prevSelected && promptFiles.some((r) => r.name === prevSelected) ? prevSelected : null
      const nextName = preferred ?? promptFiles[0]?.name ?? null
      promptSelected = nextName
      const row = nextName ? promptFiles.find((r) => r.name === nextName) : null
      promptDraft = row?.template_text ?? ""
      promptDirty = false
    } catch (err) {
      console.error("[prompts] Failed to load prompt templates", err)
      promptError = "Failed to load prompt templates."
    } finally {
      promptLoading = false
    }
  }

  function selectPromptFile(name: PromptTemplateFile["name"]) {
    if (name === promptSelected) return
    if (promptDirty && typeof window !== "undefined") {
      const ok = window.confirm("Discard unsaved prompt changes?")
      if (!ok) return
    }
    promptError = null
    promptDirty = false
    promptSelected = name
    const row = promptFiles.find((p) => p.name === name)
    promptDraft = row?.template_text ?? ""
  }

  async function savePromptFile() {
    if (promptSaving || !promptSelected) return
    promptError = null
    promptSaving = true
    try {
      const updated = await settingsService.updatePromptTemplate(promptSelected, promptDraft)
      promptFiles = promptFiles.map((p) => (p.name === updated.name ? updated : p))
      promptDraft = updated.template_text
      promptDirty = false
    } catch (err) {
      console.error("[prompts] Failed to save prompt template", err)
      promptError = err instanceof Error ? err.message : "Failed to save prompt template."
    } finally {
      promptSaving = false
    }
  }

  async function resetPromptFile() {
    if (promptSaving || !promptSelected) return
    if (typeof window !== "undefined") {
      const ok = window.confirm("Reset this template to the built-in defaults?")
      if (!ok) return
    }
    promptSaving = true
    promptError = null
    try {
      const updated = await settingsService.resetPromptTemplate(promptSelected)
      promptFiles = promptFiles.map((p) => (p.name === updated.name ? updated : p))
      promptDraft = updated.template_text
      promptDirty = false
    } catch (err) {
      console.error("[prompts] Failed to reset prompt template", err)
      promptError = err instanceof Error ? err.message : "Failed to reset prompt template."
    } finally {
      promptSaving = false
    }
  }

  async function resetAllAllowedPromptFiles() {
    if (promptSaving) return
    if (typeof window !== "undefined") {
      const ok = window.confirm("Reset ALL prompt templates in this section to built-in defaults?")
      if (!ok) return
    }
    promptSaving = true
    promptError = null
    promptDirty = false
    try {
      for (const name of allowedNames) {
        await settingsService.resetPromptTemplate(name)
      }
      await loadPromptFiles({ preserveSelection: true })
    } catch (err) {
      console.error("[prompts] Failed to reset prompt templates", err)
      promptError = err instanceof Error ? err.message : "Failed to reset prompt templates."
    } finally {
      promptSaving = false
    }
  }

  onMount(() => {
    void loadPromptFiles()
  })
</script>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <FileText class="size-4 text-muted-foreground" aria-hidden="true" />
      {title}
    </CardTitle>
    <CardDescription>{description}</CardDescription>
  </CardHeader>
  <CardContent class="space-y-4">
    {#if promptFiles.length === 0}
      <div class="text-sm text-muted-foreground">{promptLoading ? "Loading…" : "No prompt templates found."}</div>
    {:else if promptSelected}
      <Tabs.Root
        value={promptSelected}
        onValueChange={(next) => selectPromptFile(next as PromptTemplateFile["name"])}
        class="gap-3"
      >
        <div class="overflow-x-auto pb-1">
          <Tabs.List aria-label="Prompt templates" class="w-max">
            {#each promptFiles as p (p.name)}
              <Tabs.Trigger value={p.name} disabled={promptLoading || promptSaving} class="flex-none text-xs">
                <span class="whitespace-nowrap">{PROMPT_LABELS[p.name] ?? p.name}</span>
                {#if p.name === promptSelected && promptDirty}
                  <span class="text-[10px]" title="Unsaved changes" aria-label="Unsaved changes">●</span>
                {/if}
              </Tabs.Trigger>
            {/each}
          </Tabs.List>
        </div>
      </Tabs.Root>
    {/if}

    <div class="space-y-2">
      <InputGroup.Root
        data-disabled={promptLoading || promptSaving || !promptSelected ? "true" : undefined}
        class="min-h-[420px]"
      >
        <InputGroup.Addon align="block-start" class="border-b justify-between gap-2 cursor-default">
          <div class="space-y-1">
            <Label for={templateId} class="text-foreground">Template (text)</Label>
            <div class="text-xs text-muted-foreground">
              {promptLoading
                ? "Loading…"
                : promptSelectedRow?.updated_at
                  ? `Updated: ${promptSelectedRow.updated_at}`
                  : "Not loaded"}
            </div>
          </div>
        </InputGroup.Addon>

        <InputGroup.Textarea
          id={templateId}
          class="min-h-[420px] font-mono text-xs leading-relaxed"
          rows={18}
          bind:value={promptDraft}
          spellcheck={false}
          disabled={promptLoading || promptSaving || !promptSelected}
          oninput={() => (promptDirty = true)}
        />

        <InputGroup.Addon align="block-end" class="border-t justify-end gap-2 cursor-default flex-wrap">
          <Button disabled={!promptDirty || promptSaving || promptLoading || !promptSelected} onclick={savePromptFile}>
            {promptSaving ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="outline"
            disabled={promptSaving || promptLoading || !promptSelected}
            onclick={resetPromptFile}>Reset</Button
          >
          {#if allowedNames.length > 1}
            <Button variant="destructive" disabled={promptSaving || promptLoading} onclick={resetAllAllowedPromptFiles}>
              Reset All
            </Button>
          {/if}
        </InputGroup.Addon>
      </InputGroup.Root>
    </div>

    {#if promptError}
      <div class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {promptError}
      </div>
    {/if}
  </CardContent>
</Card>
