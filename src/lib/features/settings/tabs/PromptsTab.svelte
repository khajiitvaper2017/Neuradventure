<script lang="ts">
  import { settings as settingsService } from "@/services/settings"
  import type { PromptConfigFile } from "@/shared/api-types"
  import * as Select from "@/components/ui/select"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
  import { Label } from "@/components/ui/label"
  import * as Tabs from "@/components/ui/tabs/index.js"
  import { Textarea } from "@/components/ui/textarea"
  import { sectionFormat } from "@/stores/settings"

  type Props = {
    active?: boolean
  }

  let { active = false }: Props = $props()

  const PROMPT_LABELS: Record<PromptConfigFile["name"], string> = {
    "narrative-turn": "Narrative Turn",
    "character-generation": "Character Generation",
    "story-setup": "Story Setup",
    "chat-mode": "Chat Mode",
    "npc-creation": "NPC Creation",
    "player-impersonation": "Player Impersonation",
  }

  const SECTION_FORMAT_OPTIONS = [
    { value: "markdown", label: "Markdown — ## Section" },
    { value: "xml", label: "XML — <section>…</section>" },
    { value: "equals", label: "Equals — === SECTION ===" },
    { value: "bbcode", label: "BBCode — [section]…[/section]" },
    { value: "colon", label: "Colon — Section:" },
    { value: "none", label: "None — no wrappers" },
  ]

  let promptFiles = $state<PromptConfigFile[]>([])
  let promptSelected = $state<PromptConfigFile["name"]>("narrative-turn")
  let promptDraft = $state<string>("")
  let promptDirty = $state(false)
  let promptLoading = $state(false)
  let promptSaving = $state(false)
  let promptError = $state<string | null>(null)
  let promptSelectedRow = $derived(promptFiles.find((p) => p.name === promptSelected) ?? null)

  let loadedOnce = $state(false)

  async function loadPromptFiles(options?: { preserveSelection?: boolean }) {
    if (promptLoading) return
    const prevSelected = options?.preserveSelection ? promptSelected : null
    promptLoading = true
    promptError = null
    try {
      const rows = await settingsService.promptConfigs()
      promptFiles = rows
      const preferred = prevSelected && rows.some((r) => r.name === prevSelected) ? prevSelected : null
      const nextName = preferred ?? rows[0]?.name ?? null
      if (nextName) {
        promptSelected = nextName
        const row = rows.find((r) => r.name === nextName)
        promptDraft = row?.config_json ?? ""
        promptDirty = false
      } else {
        promptDraft = ""
        promptDirty = false
      }
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
    if (promptSaving) return
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
    if (promptSaving) return
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

  async function resetAllPromptFiles() {
    if (promptSaving) return
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "Reset ALL prompt templates to built-in defaults? This will overwrite all prompt edits.",
      )
      if (!ok) return
    }
    promptSaving = true
    promptError = null
    promptDirty = false
    try {
      await settingsService.resetAllPromptConfigs()
      await loadPromptFiles({ preserveSelection: true })
    } catch (err) {
      console.error("[prompts] Failed to reset all prompt configs", err)
      promptError = err instanceof Error ? err.message : "Failed to reset all prompt configs."
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
    const row = promptFiles.find((p) => p.name === promptSelected) ?? promptFiles[0]
    if (!row) return
    if (row.name !== promptSelected) promptSelected = row.name
    if (!promptDirty) promptDraft = row.config_json
  })
</script>

<div class="space-y-4">
  <Card>
    <CardHeader>
      <CardTitle>Prompt Formatting</CardTitle>
      <CardDescription>
        Controls how context sections are wrapped in prompts sent to the model. This does not change the required JSON
        output format.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-2">
      <Label>Section wrapper format</Label>
      <Select.Root type="single" bind:value={$sectionFormat} items={SECTION_FORMAT_OPTIONS}>
        <Select.Trigger class="w-full" aria-label="Section wrapper format">
          {SECTION_FORMAT_OPTIONS.find((o) => o.value === $sectionFormat)?.label ?? "Select…"}
        </Select.Trigger>
        <Select.Content>
          {#each SECTION_FORMAT_OPTIONS as option (option.value)}
            <Select.Item {...option} />
          {/each}
        </Select.Content>
      </Select.Root>
      <div class="text-xs text-muted-foreground">Global setting (applies to all prompts).</div>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>Prompt Templates</CardTitle>
      <CardDescription
        >Advanced: edit JSON stored in SQLite. Changes affect future generations immediately.</CardDescription
      >
    </CardHeader>
    <CardContent class="space-y-4">
      {#if promptFiles.length === 0}
        <div class="text-sm text-muted-foreground">{promptLoading ? "Loading…" : "No prompt templates found."}</div>
      {:else}
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
          disabled={promptLoading || promptSaving}
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
      <Button disabled={!promptDirty || promptSaving || promptLoading} onclick={savePromptFile}>
        {promptSaving ? "Saving…" : "Save"}
      </Button>
      <Button variant="outline" disabled={promptSaving || promptLoading} onclick={formatPromptDraft}>Format</Button>
      <Button variant="outline" disabled={promptSaving || promptLoading} onclick={resetPromptFile}>Reset</Button>
      <Button variant="destructive" disabled={promptSaving || promptLoading} onclick={resetAllPromptFiles}>
        Reset All
      </Button>
    </CardFooter>
  </Card>
</div>
