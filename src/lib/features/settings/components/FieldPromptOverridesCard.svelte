<script lang="ts">
  import { settings as settingsService } from "@/services/settings"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"
  import * as Select from "@/components/ui/select"
  import { Textarea } from "@/components/ui/textarea"

  type Props = {
    title: string
    description: string
    keys: string[]
    builtins: Record<string, string>
    overrides: Record<string, string>
    onOverridesUpdated: (next: Record<string, string>) => void
    showResetAll?: boolean
    idBase?: string
  }

  let {
    title,
    description,
    keys,
    builtins,
    overrides,
    onOverridesUpdated,
    showResetAll = true,
    idBase = "",
  }: Props = $props()

  const derivedIdBase = $derived(
    idBase ||
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") ||
      "field-prompts",
  )
  const searchId = $derived(`${derivedIdBase}-prompt-search`)

  let promptSearch = $state("")
  let selectedKey = $state<string>("")

  let overrideDraft = $state("")
  let overrideDirty = $state(false)
  let overrideSaving = $state(false)
  let error = $state<string | null>(null)

  const filteredKeys = $derived.by(() => {
    const q = promptSearch.trim().toLowerCase()
    const base = q ? keys.filter((k) => k.toLowerCase().includes(q)) : keys
    return base.slice(0, 500)
  })

  $effect(() => {
    if (selectedKey && !keys.includes(selectedKey)) selectedKey = ""
  })

  $effect(() => {
    if (!selectedKey) {
      overrideDraft = ""
      overrideDirty = false
      return
    }
    overrideDraft = overrides[selectedKey] ?? ""
    overrideDirty = false
  })

  async function saveOverride() {
    if (!selectedKey || overrideSaving) return
    error = null
    overrideSaving = true
    try {
      const value = overrideDraft.trim()
      if (!value) {
        const next = await settingsService.resetFieldPromptOverride(selectedKey)
        onOverridesUpdated(next)
      } else {
        const next = await settingsService.setFieldPromptOverride(selectedKey, value)
        onOverridesUpdated(next)
      }
      overrideDirty = false
    } catch (err) {
      console.error("[field-prompts] Failed to save override", err)
      error = err instanceof Error ? err.message : "Failed to save override."
    } finally {
      overrideSaving = false
    }
  }

  async function resetOverride() {
    if (!selectedKey || overrideSaving) return
    error = null
    overrideSaving = true
    try {
      const next = await settingsService.resetFieldPromptOverride(selectedKey)
      onOverridesUpdated(next)
      overrideDirty = false
    } catch (err) {
      console.error("[field-prompts] Failed to reset override", err)
      error = err instanceof Error ? err.message : "Failed to reset override."
    } finally {
      overrideSaving = false
    }
  }

  async function resetAllOverrides() {
    if (overrideSaving) return
    if (typeof window !== "undefined") {
      const ok = window.confirm("Reset ALL field prompt overrides to built-in defaults?")
      if (!ok) return
    }
    overrideSaving = true
    error = null
    try {
      await settingsService.resetAllFieldPromptOverrides()
      const next = await settingsService.fieldPromptOverrides()
      onOverridesUpdated(next)
      selectedKey = ""
      overrideDraft = ""
      overrideDirty = false
    } catch (err) {
      console.error("[field-prompts] Failed to reset all overrides", err)
      error = err instanceof Error ? err.message : "Failed to reset all overrides."
    } finally {
      overrideSaving = false
    }
  }
</script>

<Card>
  <CardHeader>
    <CardTitle>{title}</CardTitle>
    <CardDescription>{description}</CardDescription>
  </CardHeader>
  <CardContent class="space-y-4">
    {#if error}
      <div class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
    {/if}

    <div class="grid gap-3 md:grid-cols-[1fr_1.4fr]">
      <div class="space-y-2">
        <Label for={searchId}>Search keys</Label>
        <Input
          id={searchId}
          placeholder="e.g. llm.turn_response"
          value={promptSearch}
          oninput={(e) => (promptSearch = (e.target as HTMLInputElement).value)}
        />
        <div class="space-y-2">
          <Label>Key</Label>
          <Select.Root
            type="single"
            value={selectedKey}
            items={filteredKeys.map((k) => ({ value: k, label: k }))}
            onValueChange={(v) => (selectedKey = v as string)}
          >
            <Select.Trigger class="w-full" aria-label="Field prompt key">
              <span class="truncate font-mono text-xs">{selectedKey || "Select…"}</span>
            </Select.Trigger>
            <Select.Content class="max-h-[320px]">
              {#each filteredKeys as k (k)}
                <Select.Item value={k} label={k} />
              {/each}
            </Select.Content>
          </Select.Root>
          <div class="text-xs text-muted-foreground">{filteredKeys.length} key(s)</div>
        </div>
      </div>

      <div class="space-y-3">
        <div class="space-y-2">
          <Label>Built-in</Label>
          <Textarea rows={6} value={selectedKey ? (builtins[selectedKey] ?? "") : ""} disabled />
        </div>
        <div class="space-y-2">
          <Label>Override</Label>
          <Textarea
            rows={6}
            value={overrideDraft}
            oninput={(e) => {
              overrideDraft = (e.target as HTMLTextAreaElement).value
              overrideDirty = true
            }}
            disabled={!selectedKey || overrideSaving}
          />
          <div class="text-xs text-muted-foreground">
            Leave empty to use built-in (saving empty removes the override).
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onclick={resetOverride} disabled={!selectedKey || overrideSaving}>Reset key</Button>
          <Button onclick={saveOverride} disabled={!selectedKey || overrideSaving || !overrideDirty}>
            {overrideSaving ? "Saving..." : "Save override"}
          </Button>
        </div>
      </div>
    </div>
  </CardContent>
  {#if showResetAll}
    <CardFooter class="justify-end">
      <Button variant="outline" onclick={resetAllOverrides} disabled={overrideSaving}>Reset all overrides</Button>
    </CardFooter>
  {/if}
</Card>
