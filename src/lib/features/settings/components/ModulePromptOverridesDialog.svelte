<script lang="ts">
  import { settings as settingsService } from "@/services/settings"
  import { Button } from "@/components/ui/button"
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog"
  import * as InputGroup from "@/components/ui/input-group"
  import { Label } from "@/components/ui/label"
  import { ScrollArea } from "@/components/ui/scroll-area"

  type Props = {
    open?: boolean
    moduleId: string
    title: string
    sharedNote?: string
    keys: string[]
    builtins: Record<string, string>
    disabled?: boolean
    onClose: () => void
  }

  let { open = false, moduleId, title, sharedNote = "", keys, builtins, disabled = false, onClose }: Props = $props()

  const visibleKeys = $derived(keys.filter((k) => typeof builtins[k] === "string"))

  let loading = $state(false)
  let saving = $state(false)
  let error = $state<string | null>(null)

  let initial = $state<Record<string, string>>({})
  let draft = $state<Record<string, string>>({})

  $effect(() => {
    if (!open) return
    const nextInitial: Record<string, string> = {}
    const nextDraft: Record<string, string> = {}
    for (const k of visibleKeys) {
      const base = builtins[k] ?? ""
      nextInitial[k] = base
      nextDraft[k] = base
    }
    initial = nextInitial
    draft = nextDraft

    error = null
    saving = false
    loading = true
    const openedModule = moduleId
    void (async () => {
      try {
        const overrides = await settingsService.fieldPromptOverrides()
        if (!open || openedModule !== moduleId) return
        const nextLoadedInitial: Record<string, string> = {}
        const nextLoadedDraft: Record<string, string> = {}
        for (const k of visibleKeys) {
          const base = builtins[k] ?? ""
          const effective = overrides[k] ?? base
          nextLoadedInitial[k] = effective
          nextLoadedDraft[k] = effective
        }
        initial = nextLoadedInitial
        draft = nextLoadedDraft
      } catch (err) {
        console.error("[field-prompts] Failed to load module overrides", err)
        error = err instanceof Error ? err.message : "Failed to load overrides."
      } finally {
        if (!open || openedModule !== moduleId) return
        loading = false
      }
    })()
  })

  const dirty = $derived.by(() => {
    for (const k of visibleKeys) {
      if ((draft[k] ?? "").trim() !== (initial[k] ?? "").trim()) return true
    }
    return false
  })

  function setDraft(key: string, value: string) {
    draft = { ...draft, [key]: value }
  }

  function resetKey(key: string) {
    setDraft(key, builtins[key] ?? "")
  }

  function resetModule() {
    const next: Record<string, string> = { ...draft }
    for (const k of visibleKeys) next[k] = builtins[k] ?? ""
    draft = next
  }

  function promptIdFor(moduleId: string, key: string) {
    return `${moduleId}-${key}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
  }

  async function save() {
    if (loading || saving || !dirty) return
    saving = true
    error = null
    try {
      for (const k of visibleKeys) {
        const before = (initial[k] ?? "").trim()
        const after = (draft[k] ?? "").trim()
        if (before === after) continue
        const builtin = (builtins[k] ?? "").trim()
        if (!after || after === builtin) await settingsService.resetFieldPromptOverride(k)
        else await settingsService.setFieldPromptOverride(k, after)
      }
      onClose()
    } catch (err) {
      console.error("[field-prompts] Failed to save module overrides", err)
      error = err instanceof Error ? err.message : "Failed to save overrides."
    } finally {
      saving = false
    }
  }
</script>

<Dialog
  {open}
  onOpenChange={(next) => {
    if (!next && open) onClose()
  }}
>
  <DialogContent class="max-w-3xl">
    <DialogHeader>
      <DialogTitle>{title} — Prompts</DialogTitle>
      <DialogDescription>
        Override built-in JSON schema descriptions used for structured outputs. Overrides are global (apply to all
        stories).
      </DialogDescription>
    </DialogHeader>

    {#if sharedNote}
      <div class="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">{sharedNote}</div>
    {/if}

    {#if visibleKeys.length === 0}
      <div class="text-sm text-muted-foreground">No prompt keys mapped for this module.</div>
    {:else}
      <ScrollArea class="h-[56vh]">
        <div class="space-y-4 pr-3">
          {#each visibleKeys as k (k)}
            <div class="rounded-md border p-4">
              <InputGroup.Root data-disabled={disabled || saving || loading ? "true" : undefined} class="min-h-24">
                <InputGroup.Addon align="block-start" class="border-b justify-between gap-2 cursor-default">
                  <div class="space-y-1">
                    <Label for={promptIdFor(moduleId, k)} class="text-foreground">Prompt</Label>
                    <div class="text-xs text-muted-foreground">
                      <span class="font-mono font-medium text-foreground/80">{k}</span>
                      {#if (draft[k] ?? "").trim() === (builtins[k] ?? "").trim()}
                        <span> · Using built-in</span>
                      {:else}
                        <span> · Override active</span>
                      {/if}
                    </div>
                  </div>
                </InputGroup.Addon>

                <InputGroup.Textarea
                  id={promptIdFor(moduleId, k)}
                  rows={6}
                  value={draft[k] ?? ""}
                  oninput={(e) => setDraft(k, (e.target as HTMLTextAreaElement).value)}
                  disabled={disabled || saving || loading}
                />

                <InputGroup.Addon align="block-end" class="border-t justify-between gap-2 cursor-default">
                  <div class="text-xs text-muted-foreground">
                    Save creates/updates an override. Reset removes the override (built-in).
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-8"
                    onclick={() => resetKey(k)}
                    disabled={disabled || saving || loading}
                  >
                    Reset
                  </Button>
                </InputGroup.Addon>
              </InputGroup.Root>
            </div>
          {/each}
        </div>
      </ScrollArea>
    {/if}

    {#if error}
      <div class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
    {/if}

    <DialogFooter class="gap-2">
      <Button variant="outline" onclick={onClose} disabled={disabled || saving || loading}>Cancel</Button>
      <Button variant="outline" onclick={resetModule} disabled={disabled || saving || loading}>Reset module</Button>
      <Button onclick={save} disabled={disabled || saving || loading || !dirty}>{saving ? "Saving..." : "Save"}</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
