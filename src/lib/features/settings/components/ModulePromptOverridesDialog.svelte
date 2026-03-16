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
  import { Label } from "@/components/ui/label"
  import { ScrollArea } from "@/components/ui/scroll-area"
  import { Separator } from "@/components/ui/separator"
  import { Textarea } from "@/components/ui/textarea"

  type Props = {
    open?: boolean
    moduleId: string
    title: string
    sharedNote?: string
    keys: string[]
    builtins: Record<string, string>
    overrides: Record<string, string>
    disabled?: boolean
    onClose: () => void
    onOverridesUpdated: (next: Record<string, string>) => void
  }

  let {
    open = false,
    moduleId,
    title,
    sharedNote = "",
    keys,
    builtins,
    overrides,
    disabled = false,
    onClose,
    onOverridesUpdated,
  }: Props = $props()

  const visibleKeys = $derived(keys.filter((k) => typeof builtins[k] === "string"))

  let saving = $state(false)
  let error = $state<string | null>(null)

  let initial = $state<Record<string, string>>({})
  let draft = $state<Record<string, string>>({})

  $effect(() => {
    if (!open) return
    void moduleId
    const nextInitial: Record<string, string> = {}
    const nextDraft: Record<string, string> = {}
    for (const k of visibleKeys) {
      nextInitial[k] = overrides[k] ?? ""
      nextDraft[k] = overrides[k] ?? ""
    }
    initial = nextInitial
    draft = nextDraft
    error = null
    saving = false
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
    setDraft(key, "")
  }

  function resetModule() {
    const next: Record<string, string> = { ...draft }
    for (const k of visibleKeys) next[k] = ""
    draft = next
  }

  async function save() {
    if (saving || !dirty) return
    saving = true
    error = null
    try {
      for (const k of visibleKeys) {
        const before = (initial[k] ?? "").trim()
        const after = (draft[k] ?? "").trim()
        if (before === after) continue
        if (!after) await settingsService.resetFieldPromptOverride(k)
        else await settingsService.setFieldPromptOverride(k, after)
      }
      const next = await settingsService.fieldPromptOverrides()
      onOverridesUpdated(next)
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
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="truncate font-mono text-xs text-muted-foreground">{k}</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-8"
                  onclick={() => resetKey(k)}
                  disabled={disabled || saving}
                >
                  Reset key
                </Button>
              </div>

              <Separator class="my-3" />

              <div class="grid gap-3 md:grid-cols-2">
                <div class="space-y-2">
                  <Label>Built-in</Label>
                  <Textarea rows={6} value={builtins[k] ?? ""} disabled />
                </div>
                <div class="space-y-2">
                  <Label>Override</Label>
                  <Textarea
                    rows={6}
                    value={draft[k] ?? ""}
                    oninput={(e) => setDraft(k, (e.target as HTMLTextAreaElement).value)}
                    disabled={disabled || saving}
                  />
                  <div class="text-xs text-muted-foreground">Leave empty to use built-in.</div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </ScrollArea>
    {/if}

    {#if error}
      <div class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
    {/if}

    <DialogFooter class="gap-2">
      <Button variant="outline" onclick={onClose} disabled={disabled || saving}>Cancel</Button>
      <Button variant="outline" onclick={resetModule} disabled={disabled || saving}>Reset module</Button>
      <Button onclick={save} disabled={disabled || saving || !dirty}>{saving ? "Saving..." : "Save"}</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
