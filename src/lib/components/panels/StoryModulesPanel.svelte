<script lang="ts">
  import type { StoryModules } from "@/types/types"
  import { CharacterRole } from "@/types/roles"
  import { MODULE_DEFS_BY_ID, STORY_MODULE_FIELD_ROWS, type StoryModuleKey } from "@/domain/story/module-definitions"
  import { settings as settingsService } from "@/services/settings"
  import type { CustomFieldDef } from "@/types/api"
  import { cn } from "@/utils.js"
  import { Switch } from "@/components/ui/switch"
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
  import { SlidersHorizontal } from "@lucide/svelte"
  import { onMount } from "svelte"

  type Props = {
    modules: StoryModules
    setModules: (next: StoryModules) => void
    bare?: boolean
    onOpenPrompts?: (moduleKey: StoryModuleKey) => void
  }

  let { modules, setModules, bare = false, onOpenPrompts }: Props = $props()

  function updateModule<K extends StoryModuleKey>(key: K, value: boolean) {
    setModules({ ...modules, [key]: value })
  }

  let customDefs = $state<CustomFieldDef[]>([])
  let customDefsLoaded = $state(false)
  let customDefsError = $state<string | null>(null)

  async function loadCustomDefs() {
    if (customDefsLoaded) return
    customDefsError = null
    try {
      customDefs = await settingsService.customFields()
    } catch (err) {
      customDefsError = err instanceof Error ? err.message : "Failed to load custom fields."
      customDefs = []
    } finally {
      customDefsLoaded = true
    }
  }

  onMount(() => {
    void loadCustomDefs()
  })

  const enabledCharacterCustomDefs = $derived.by(() =>
    customDefs
      .filter((d) => d.enabled && d.scope === "character")
      .slice()
      .sort((a, b) => {
        const ao = a.sort_order ?? 0
        const bo = b.sort_order ?? 0
        if (ao !== bo) return ao - bo
        return a.label.localeCompare(b.label)
      }),
  )

  function customModuleValue(fieldId: string, target: CharacterRole): boolean {
    const raw = modules.custom_field_modules?.[fieldId]?.[target]
    return typeof raw === "boolean" ? raw : true
  }

  function setCustomModuleValue(fieldId: string, target: CharacterRole, value: boolean) {
    const next = { ...(modules.custom_field_modules ?? {}) }
    const current = next[fieldId] ?? {}
    next[fieldId] = { ...current, [target]: value }
    setModules({ ...modules, custom_field_modules: next } as StoryModules)
  }

  let customPromptOpen = $state(false)
  let customPromptSaving = $state(false)
  let customPromptError = $state<string | null>(null)
  let activeCustomDef = $state<CustomFieldDef | null>(null)
  let customPromptDraft = $state("")

  function openCustomPrompt(def: CustomFieldDef) {
    activeCustomDef = def
    customPromptDraft = def.prompt ?? ""
    customPromptError = null
    customPromptSaving = false
    customPromptOpen = true
  }

  function closeCustomPrompt() {
    customPromptOpen = false
  }

  async function saveCustomPrompt() {
    if (!activeCustomDef || customPromptSaving) return
    customPromptSaving = true
    customPromptError = null
    try {
      const saved = await settingsService.upsertCustomField({
        id: activeCustomDef.id,
        scope: activeCustomDef.scope,
        value_type: activeCustomDef.value_type,
        label: activeCustomDef.label,
        placement: activeCustomDef.placement,
        prompt: customPromptDraft,
        enabled: activeCustomDef.enabled,
        sort_order: activeCustomDef.sort_order ?? 0,
      })
      customDefs = customDefs.map((d) => (d.id === saved.id ? saved : d))
      closeCustomPrompt()
    } catch (err) {
      customPromptError = err instanceof Error ? err.message : "Failed to save custom field prompt."
    } finally {
      customPromptSaving = false
    }
  }

  // Fixed widths shared between column headers and their cells so text-center aligns over controls.
  // COL_SWITCH: wide enough for the switch + border + padding.
  // COL_BTN: wide enough for the icon button, and "Prompts" header fits without wrapping.
  const COL_SWITCH = "w-14"
  const COL_BTN = "w-16"
  const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4rem] items-center gap-x-2"
</script>

{#snippet SwitchCell(key, disabled, label)}
  <div
    class={cn(
      COL_SWITCH,
      "flex items-center justify-center rounded-md border bg-card/60 py-1",
      disabled && "opacity-50 pointer-events-none",
    )}
  >
    <Switch
      checked={Boolean(modules[key])}
      {disabled}
      onCheckedChange={(v) => updateModule(key, v)}
      aria-label={`Toggle ${label}`}
    />
  </div>
{/snippet}

{#snippet PromptsIconButton(label, onclick)}
  <Button
    variant="ghost"
    size="icon"
    class="h-8 w-8 shrink-0 mx-auto"
    {onclick}
    aria-label={`Edit prompts for ${label}`}
  >
    <SlidersHorizontal class="size-3.5" aria-hidden="true" />
  </Button>
{/snippet}

{#snippet ColHeaders(labelA, labelB)}
  <div class={cn(ROW_GRID, "pb-1 select-none")}>
    <div></div>
    <div
      class={cn(COL_SWITCH, "text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60")}
    >
      {labelA}
    </div>
    <div
      class={cn(COL_SWITCH, "text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60")}
    >
      {labelB}
    </div>
    {#if onOpenPrompts}
      <div
        class={cn(COL_BTN, "text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60")}
      >
        Prompts
      </div>
    {/if}
  </div>
{/snippet}

{#snippet FieldRow(row)}
  {@const npcDisabled = !!row.npcKey && !modules.track_npcs}
  {@const promptKey = row.promptKey ?? row.characterKey ?? row.npcKey}
  <div class={cn(ROW_GRID, "border-b py-2 last:border-b-0")}>
    <div class="min-w-0 pr-3">
      <div class="text-sm font-medium leading-snug text-foreground">{row.title}</div>
      {#if row.sub}
        <div class="mt-0.5 text-xs leading-snug text-muted-foreground">{row.sub}</div>
      {/if}
    </div>

    <div class="flex justify-center">
      {#if row.characterKey}
        {@render SwitchCell(row.characterKey, false, `Player ${row.title}`)}
      {:else}
        <span class="px-2 text-xs text-muted-foreground/40">—</span>
      {/if}
    </div>

    <div class="flex justify-center">
      {#if row.npcKey}
        {@render SwitchCell(row.npcKey, npcDisabled, `NPC ${row.title}`)}
      {:else}
        <span class="px-2 text-xs text-muted-foreground/40">—</span>
      {/if}
    </div>

    <div class="flex justify-center">
      {#if promptKey && onOpenPrompts}
        {@render PromptsIconButton(row.title, () => onOpenPrompts?.(promptKey))}
      {:else if onOpenPrompts}
        <div class="w-8"></div>
      {/if}
    </div>
  </div>
{/snippet}

{#snippet CustomFieldRow(def)}
  {@const npcDisabled = !modules.track_npcs}
  <div class={cn(ROW_GRID, "border-b py-2 last:border-b-0")}>
    <div class="min-w-0 pr-3">
      <div class="text-sm font-medium leading-snug text-foreground">{def.label}</div>
      <div class="mt-0.5 font-mono text-xs text-muted-foreground/60">
        {def.id} · {def.value_type === "list" ? "list" : "text"} · {def.placement}
      </div>
    </div>

    <div class="flex justify-center">
      <div class="w-14 flex items-center justify-center rounded-md border bg-card/60 py-1">
        <Switch
          checked={customModuleValue(def.id, CharacterRole.Player)}
          onCheckedChange={(v) => setCustomModuleValue(def.id, CharacterRole.Player, v)}
          aria-label={`Toggle player custom field ${def.label}`}
        />
      </div>
    </div>

    <div class="flex justify-center">
      <div
        class={cn(
          "w-14 flex items-center justify-center rounded-md border bg-card/60 py-1",
          npcDisabled && "opacity-50 pointer-events-none",
        )}
      >
        <Switch
          checked={customModuleValue(def.id, CharacterRole.Npc)}
          disabled={npcDisabled}
          onCheckedChange={(v) => setCustomModuleValue(def.id, CharacterRole.Npc, v)}
          aria-label={`Toggle NPC custom field ${def.label}`}
        />
      </div>
    </div>

    <div class="flex justify-center">
      {#if onOpenPrompts}
        {@render PromptsIconButton(def.label, () => openCustomPrompt(def))}
      {/if}
    </div>
  </div>
{/snippet}

<div class={cn(!bare && "rounded-lg border bg-card shadow-sm")}>
  <div class={cn(bare ? "space-y-5" : "divide-y divide-border")}>
    <!-- Core section -->
    <div>
      <div class={cn(bare ? "pb-0" : "px-4 pb-0 pt-3")}>
        <span class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Core</span>
      </div>
      <div class={cn(bare ? "" : "px-4 pb-3")}>
        {@render ColHeaders("On", "")}
        {#each ["track_npcs", "track_background_events"] as const as key (key)}
          {@const meta = MODULE_DEFS_BY_ID[key]}
          <div class={cn(ROW_GRID, "border-b py-2 last:border-b-0")}>
            <div class="min-w-0 pr-3">
              <div class="text-sm font-medium leading-snug text-foreground">{meta.title}</div>
              {#if meta.sub}
                <div class="mt-0.5 text-xs leading-snug text-muted-foreground">{meta.sub}</div>
              {/if}
            </div>

            <div class="flex justify-center">
              {@render SwitchCell(key, false, meta.title)}
            </div>

            <!-- empty NPC column — keeps the grid stable so col widths match Fields section -->
            <div></div>

            <div class="flex justify-center">
              {#if onOpenPrompts}
                {@render PromptsIconButton(meta.title, () => onOpenPrompts?.(key))}
              {:else}
                <div class="w-8"></div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Fields section -->
    <div>
      <div class={cn(bare ? "pb-0 pt-3" : "px-4 pb-0 pt-3")}>
        <span class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Fields</span>
      </div>
      <div class={cn(bare ? "" : "px-4 pb-3")}>
        {@render ColHeaders("Player", "NPC")}
        {#each STORY_MODULE_FIELD_ROWS as row (row.id)}
          {@render FieldRow(row)}
        {/each}
      </div>
    </div>

    <!-- Custom Fields section -->
    {#if customDefsError}
      <div class={cn(bare ? "pt-3" : "px-4 py-3")}>
        <div class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {customDefsError}
        </div>
      </div>
    {:else if enabledCharacterCustomDefs.length > 0}
      <div>
        <div class={cn(bare ? "pb-0 pt-3" : "px-4 pb-0 pt-3")}>
          <span class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Custom Fields</span
          >
        </div>
        <div class={cn(bare ? "" : "px-4 pb-3")}>
          {@render ColHeaders("Player", "NPC")}
          {#each enabledCharacterCustomDefs as def (def.id)}
            {@render CustomFieldRow(def)}
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<Dialog
  open={customPromptOpen}
  onOpenChange={(next) => {
    if (!next && customPromptOpen) closeCustomPrompt()
  }}
>
  <DialogContent class="max-w-3xl">
    <DialogHeader>
      <DialogTitle>{activeCustomDef ? `${activeCustomDef.label} — Prompts` : "Custom field — Prompts"}</DialogTitle>
      <DialogDescription>
        This prompt is used as the JSON schema description for this custom field during structured outputs.
      </DialogDescription>
    </DialogHeader>

    {#if activeCustomDef}
      <InputGroup.Root data-disabled={customPromptSaving ? "true" : undefined} class="min-h-24">
        <InputGroup.Addon align="block-start" class="border-b justify-between gap-2 cursor-default">
          <div class="space-y-1">
            <Label for={`custom-field-prompt-${activeCustomDef.id}`} class="text-foreground">Prompt</Label>
            <div class="text-xs text-muted-foreground">
              <span class="font-mono font-medium text-foreground/80"
                >{`state.character.custom_fields.${activeCustomDef.id}`}</span
              >
            </div>
          </div>
        </InputGroup.Addon>
        <InputGroup.Textarea
          id={`custom-field-prompt-${activeCustomDef.id}`}
          rows={8}
          value={customPromptDraft}
          oninput={(e) => (customPromptDraft = (e.target as HTMLTextAreaElement).value)}
          disabled={customPromptSaving}
        />
      </InputGroup.Root>
    {/if}

    {#if customPromptError}
      <div class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {customPromptError}
      </div>
    {/if}

    <DialogFooter class="gap-2">
      <Button variant="outline" onclick={closeCustomPrompt} disabled={customPromptSaving}>Cancel</Button>
      <Button onclick={saveCustomPrompt} disabled={customPromptSaving || !activeCustomDef}>
        {customPromptSaving ? "Saving..." : "Save"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
