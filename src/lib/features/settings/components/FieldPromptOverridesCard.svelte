<script lang="ts">
  import { tick } from "svelte"
  import { settings as settingsService } from "@/services/settings"
  import { showConfirm } from "@/stores/ui"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import * as InputGroup from "@/components/ui/input-group"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"
  import * as Select from "@/components/ui/select"
  import { Braces } from "@lucide/svelte"

  type Props = {
    title: string
    description: string
    keys: string[]
    builtins: Record<string, string>
    active?: boolean
    layout?: "split" | "stacked"
    showResetAll?: boolean
    idBase?: string
  }

  let {
    title,
    description,
    keys,
    builtins,
    active = true,
    layout = "split",
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
  const promptId = $derived(`${derivedIdBase}-prompt-text`)

  let promptSearch = $state("")
  let selectedKey = $state<string>("")
  let keySelectOpen = $state(false)
  let keySearchRef = $state<HTMLInputElement | null>(null)

  let fieldOverrides = $state<Record<string, string>>({})
  let fieldOverridesLoading = $state(false)
  let fieldOverridesLoaded = $state(false)

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
    overrideDraft = fieldOverrides[selectedKey] ?? builtins[selectedKey] ?? ""
    overrideDirty = false
  })

  $effect(() => {
    if (!active) return
    if (fieldOverridesLoaded || fieldOverridesLoading) return
    fieldOverridesLoading = true
    error = null
    void (async () => {
      try {
        fieldOverrides = await settingsService.fieldPromptOverrides()
        fieldOverridesLoaded = true
      } catch (err) {
        console.error("[field-prompts] Failed to load overrides", err)
        error = err instanceof Error ? err.message : "Failed to load overrides."
      } finally {
        fieldOverridesLoading = false
      }
    })()
  })

  async function saveOverride() {
    if (!selectedKey || overrideSaving) return
    error = null
    overrideSaving = true
    try {
      const value = overrideDraft.trim()
      const builtin = (builtins[selectedKey] ?? "").trim()
      if (!value || value === builtin) {
        const next = await settingsService.resetFieldPromptOverride(selectedKey)
        fieldOverrides = next
      } else {
        const next = await settingsService.setFieldPromptOverride(selectedKey, value)
        fieldOverrides = next
      }
      overrideDraft = fieldOverrides[selectedKey] ?? builtins[selectedKey] ?? ""
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
      fieldOverrides = next
      overrideDraft = builtins[selectedKey] ?? ""
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
    const ok = await showConfirm({
      title: "Reset field prompts",
      message: "Reset ALL field prompt overrides to built-in defaults?",
      confirmLabel: "Reset all",
      danger: true,
    })
    if (!ok) return
    overrideSaving = true
    error = null
    try {
      await settingsService.resetAllFieldPromptOverrides()
      const next = await settingsService.fieldPromptOverrides()
      fieldOverrides = next
      overrideDraft = selectedKey ? (builtins[selectedKey] ?? "") : ""
      overrideDirty = false
    } catch (err) {
      console.error("[field-prompts] Failed to reset all overrides", err)
      error = err instanceof Error ? err.message : "Failed to reset all overrides."
    } finally {
      overrideSaving = false
    }
  }

  async function setKeySelectOpen(next: boolean) {
    keySelectOpen = next
    if (next) {
      await tick()
      keySearchRef?.focus()
      keySearchRef?.select()
    } else {
      promptSearch = ""
    }
  }
</script>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <Braces class="size-4 text-muted-foreground" aria-hidden="true" />
      {title}
    </CardTitle>
    <CardDescription>{description}</CardDescription>
  </CardHeader>
  <CardContent class="space-y-4">
    {#if error}
      <div class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
    {/if}

    {#if layout === "split"}
      <div class="grid gap-3 md:grid-cols-[1fr_1.4fr]">
        <div class="space-y-2">
          <Label>Key</Label>
          <Select.Root
            type="single"
            open={keySelectOpen}
            value={selectedKey}
            items={filteredKeys.map((k) => ({ value: k, label: k }))}
            onOpenChange={(next) => setKeySelectOpen(Boolean(next))}
            onValueChange={(v) => (selectedKey = v as string)}
          >
            <Select.Trigger class="w-full" aria-label="Field prompt key">
              <span class="truncate font-mono text-xs">{selectedKey || "Select…"}</span>
            </Select.Trigger>
            <Select.Content class="max-h-[320px]">
              <div class="sticky top-0 z-10 border-b bg-popover p-2">
                <Input
                  bind:ref={keySearchRef}
                  id={searchId}
                  placeholder="Search keys…"
                  value={promptSearch}
                  aria-label="Search keys"
                  class="h-8 w-full"
                  oninput={(e) => (promptSearch = (e.target as HTMLInputElement).value)}
                />
              </div>
              {#each filteredKeys as k (k)}
                <Select.Item value={k} label={k} />
              {/each}
            </Select.Content>
          </Select.Root>
          <div class="text-xs text-muted-foreground">{filteredKeys.length} key(s)</div>
        </div>

        <div class="space-y-3">
          <InputGroup.Root data-disabled={!selectedKey || overrideSaving ? "true" : undefined} class="min-h-24">
            <InputGroup.Addon align="block-start" class="border-b justify-between gap-2 cursor-default">
              <div class="space-y-1">
                <Label for={promptId} class="text-foreground">Prompt</Label>
                <div class="text-xs text-muted-foreground">
                  {#if !selectedKey}
                    Select a key to edit.
                  {:else}
                    <span class="font-mono font-medium text-foreground/80">{selectedKey}</span>
                    {#if (fieldOverrides[selectedKey] ?? "").trim()}
                      <span> · Override active</span>
                    {:else}
                      <span> · Using built-in</span>
                    {/if}
                  {/if}
                </div>
              </div>
            </InputGroup.Addon>

            <InputGroup.Textarea
              id={promptId}
              rows={6}
              value={overrideDraft}
              oninput={(e) => {
                overrideDraft = (e.target as HTMLTextAreaElement).value
                overrideDirty = true
              }}
              disabled={!selectedKey || overrideSaving}
            />

            <InputGroup.Addon align="block-end" class="border-t justify-between gap-2 cursor-default">
              <div class="text-xs text-muted-foreground">
                Save creates/updates an override. Reset removes the override (built-in).
              </div>
              <div class="flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" onclick={resetOverride} disabled={!selectedKey || overrideSaving}
                  >Reset</Button
                >
                <Button onclick={saveOverride} disabled={!selectedKey || overrideSaving || !overrideDirty}>
                  {overrideSaving ? "Saving..." : "Save"}
                </Button>
                {#if showResetAll}
                  <Button variant="destructive" onclick={resetAllOverrides} disabled={overrideSaving}>Reset All</Button>
                {/if}
              </div>
            </InputGroup.Addon>
          </InputGroup.Root>
        </div>
      </div>
    {:else}
      <div class="space-y-3">
        <div class="space-y-2">
          <Label>Key</Label>
          <Select.Root
            type="single"
            open={keySelectOpen}
            value={selectedKey}
            items={filteredKeys.map((k) => ({ value: k, label: k }))}
            onOpenChange={(next) => setKeySelectOpen(Boolean(next))}
            onValueChange={(v) => (selectedKey = v as string)}
          >
            <Select.Trigger class="w-full" aria-label="Field prompt key">
              <span class="truncate font-mono text-xs">{selectedKey || "Select…"}</span>
            </Select.Trigger>
            <Select.Content class="max-h-[320px]">
              <div class="sticky top-0 z-10 border-b bg-popover p-2">
                <Input
                  bind:ref={keySearchRef}
                  id={searchId}
                  placeholder="Search keys…"
                  value={promptSearch}
                  aria-label="Search keys"
                  class="h-8 w-full"
                  oninput={(e) => (promptSearch = (e.target as HTMLInputElement).value)}
                />
              </div>
              {#each filteredKeys as k (k)}
                <Select.Item value={k} label={k} />
              {/each}
            </Select.Content>
          </Select.Root>
          <div class="text-xs text-muted-foreground">{filteredKeys.length} key(s)</div>
        </div>

        <InputGroup.Root data-disabled={!selectedKey || overrideSaving ? "true" : undefined} class="min-h-24">
          <InputGroup.Addon align="block-start" class="border-b justify-between gap-2 cursor-default">
            <div class="space-y-1">
              <Label for={promptId} class="text-foreground">Prompt</Label>
              <div class="text-xs text-muted-foreground">
                {#if !selectedKey}
                  Select a key to edit.
                {:else}
                  <span class="font-mono font-medium text-foreground/80">{selectedKey}</span>
                  {#if (fieldOverrides[selectedKey] ?? "").trim()}
                    <span> · Override active</span>
                  {:else}
                    <span> · Using built-in</span>
                  {/if}
                {/if}
              </div>
            </div>
          </InputGroup.Addon>

          <InputGroup.Textarea
            id={promptId}
            rows={6}
            value={overrideDraft}
            oninput={(e) => {
              overrideDraft = (e.target as HTMLTextAreaElement).value
              overrideDirty = true
            }}
            disabled={!selectedKey || overrideSaving}
          />

          <InputGroup.Addon align="block-end" class="border-t justify-between gap-2 cursor-default">
            <div class="text-xs text-muted-foreground">
              Save creates/updates an override. Reset removes the override (built-in).
            </div>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" onclick={resetOverride} disabled={!selectedKey || overrideSaving}>Reset</Button>
              <Button onclick={saveOverride} disabled={!selectedKey || overrideSaving || !overrideDirty}>
                {overrideSaving ? "Saving..." : "Save"}
              </Button>
              {#if showResetAll}
                <Button variant="destructive" onclick={resetAllOverrides} disabled={overrideSaving}>Reset All</Button>
              {/if}
            </div>
          </InputGroup.Addon>
        </InputGroup.Root>
      </div>
    {/if}
  </CardContent>
</Card>
