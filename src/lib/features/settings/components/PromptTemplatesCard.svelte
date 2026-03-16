<script lang="ts">
  import { settings as settingsService } from "@/services/settings"
  import type { PromptConfigFile } from "@/shared/api-types"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
  import { Label } from "@/components/ui/label"
  import * as Tabs from "@/components/ui/tabs/index.js"
  import { Textarea } from "@/components/ui/textarea"

  type Props = {
    active?: boolean
    allowedNames: PromptConfigFile["name"][]
    title?: string
    description?: string
  }

  let {
    active = false,
    allowedNames,
    title = "Prompt Templates",
    description = "Advanced: edit JSON stored in SQLite.",
  }: Props = $props()

  const PROMPT_LABELS: Record<PromptConfigFile["name"], string> = {
    "narrative-turn": "Narrative Turn",
    "character-generation": "Character Generation",
    "story-setup": "Story Setup",
    "chat-prompt-lines": "Chat Prompt",
    "chat-setup": "Chat Setup",
    "npc-creation": "NPC Creation",
    "player-impersonation": "Player Impersonation",
  }

  let promptFiles = $state<PromptConfigFile[]>([])
  let promptSelected = $state<PromptConfigFile["name"] | null>(null)
  let promptDraft = $state<string>("")
  let promptDirty = $state(false)
  let promptLoading = $state(false)
  let promptSaving = $state(false)
  let promptError = $state<string | null>(null)

  let loadedOnce = $state(false)

  const promptSelectedRow = $derived(
    promptSelected ? (promptFiles.find((p) => p.name === promptSelected) ?? null) : null,
  )

  function allowedSet(): Set<PromptConfigFile["name"]> {
    return new Set(allowedNames)
  }

  function sortByAllowed(names: PromptConfigFile[]): PromptConfigFile[] {
    const byName = new Map(names.map((n) => [n.name, n]))
    const out: PromptConfigFile[] = []
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
      const rows = await settingsService.promptConfigs()
      const filtered = rows.filter((r) => allowedSet().has(r.name))
      promptFiles = sortByAllowed(filtered)

      const preferred = prevSelected && promptFiles.some((r) => r.name === prevSelected) ? prevSelected : null
      const nextName = preferred ?? promptFiles[0]?.name ?? null
      promptSelected = nextName
      const row = nextName ? promptFiles.find((r) => r.name === nextName) : null
      promptDraft = row?.config_json ?? ""
      promptDirty = false
      loadedOnce = true
    } catch (err) {
      console.error("[prompts] Failed to load prompt configs", err)
      promptError = "Failed to load prompt configs."
    } finally {
      promptLoading = false
    }
  }

  function selectPromptFile(name: PromptConfigFile["name"]) {
    if (name === promptSelected) return
    if (promptDirty && typeof window !== "undefined") {
      const ok = window.confirm("Discard unsaved prompt changes?")
      if (!ok) return
    }
    promptError = null
    promptDirty = false
    promptSelected = name
    const row = promptFiles.find((p) => p.name === name)
    promptDraft = row?.config_json ?? ""
  }

  async function savePromptFile() {
    if (promptSaving || !promptSelected) return
    promptError = null
    try {
      JSON.parse(promptDraft)
    } catch (err) {
      promptError = err instanceof Error ? err.message : "Invalid JSON"
      return
    }
    promptSaving = true
    try {
      const updated = await settingsService.updatePromptConfig(promptSelected, promptDraft)
      promptFiles = promptFiles.map((p) => (p.name === updated.name ? updated : p))
      promptDraft = updated.config_json
      promptDirty = false
    } catch (err) {
      console.error("[prompts] Failed to save prompt config", err)
      promptError = err instanceof Error ? err.message : "Failed to save prompt config."
    } finally {
      promptSaving = false
    }
  }

  async function resetPromptFile() {
    if (promptSaving || !promptSelected) return
    if (typeof window !== "undefined") {
      const ok = window.confirm("Reset this prompt config to the built-in defaults?")
      if (!ok) return
    }
    promptSaving = true
    promptError = null
    try {
      const updated = await settingsService.resetPromptConfig(promptSelected)
      promptFiles = promptFiles.map((p) => (p.name === updated.name ? updated : p))
      promptDraft = updated.config_json
      promptDirty = false
    } catch (err) {
      console.error("[prompts] Failed to reset prompt config", err)
      promptError = err instanceof Error ? err.message : "Failed to reset prompt config."
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
        await settingsService.resetPromptConfig(name)
      }
      await loadPromptFiles({ preserveSelection: true })
    } catch (err) {
      console.error("[prompts] Failed to reset prompt configs", err)
      promptError = err instanceof Error ? err.message : "Failed to reset prompt configs."
    } finally {
      promptSaving = false
    }
  }

  function formatPromptDraft() {
    promptError = null
    try {
      const parsed = JSON.parse(promptDraft) as unknown
      promptDraft = JSON.stringify(parsed, null, 2)
      promptDirty = true
    } catch (err) {
      promptError = err instanceof Error ? err.message : "Invalid JSON"
    }
  }

  $effect(() => {
    if (!active) return
    if (loadedOnce) return
    void loadPromptFiles()
  })

  $effect(() => {
    if (promptFiles.length === 0) return
    if (!promptSelected) return
    const row = promptFiles.find((p) => p.name === promptSelected) ?? null
    if (!row) return
    if (!promptDirty) promptDraft = row.config_json
  })
</script>

<Card>
  <CardHeader>
    <CardTitle>{title}</CardTitle>
    <CardDescription>{description}</CardDescription>
  </CardHeader>
  <CardContent class="space-y-4">
    {#if promptFiles.length === 0}
      <div class="text-sm text-muted-foreground">{promptLoading ? "Loading…" : "No prompt templates found."}</div>
    {:else if promptSelected}
      <Tabs.Root
        value={promptSelected}
        onValueChange={(next) => selectPromptFile(next as PromptConfigFile["name"])}
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
      <div class="space-y-1">
        <Label>Config (JSON)</Label>
        <div class="text-xs text-muted-foreground">
          {promptLoading
            ? "Loading…"
            : promptSelectedRow?.updated_at
              ? `Updated: ${promptSelectedRow.updated_at}`
              : "Not loaded"}
        </div>
      </div>

      <Textarea
        class="min-h-[420px] w-full font-mono text-xs leading-relaxed"
        rows={18}
        bind:value={promptDraft}
        spellcheck={false}
        disabled={promptLoading || promptSaving || !promptSelected}
        oninput={() => (promptDirty = true)}
      />
    </div>

    {#if promptError}
      <div class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {promptError}
      </div>
    {/if}
  </CardContent>
  <CardFooter class="flex flex-wrap gap-2">
    <Button disabled={!promptDirty || promptSaving || promptLoading || !promptSelected} onclick={savePromptFile}>
      {promptSaving ? "Saving…" : "Save"}
    </Button>
    <Button variant="outline" disabled={promptSaving || promptLoading || !promptSelected} onclick={formatPromptDraft}
      >Format</Button
    >
    <Button variant="outline" disabled={promptSaving || promptLoading || !promptSelected} onclick={resetPromptFile}
      >Reset</Button
    >
    {#if allowedNames.length > 1}
      <Button variant="destructive" disabled={promptSaving || promptLoading} onclick={resetAllAllowedPromptFiles}>
        Reset All
      </Button>
    {/if}
  </CardFooter>
</Card>
