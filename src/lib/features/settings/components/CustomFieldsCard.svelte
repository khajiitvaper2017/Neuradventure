<script lang="ts">
  import { settings as settingsService } from "@/services/settings"
  import type { CustomFieldDef, CustomFieldScope, CustomFieldValueType } from "@/shared/api-types"
  import { cn } from "@/utils.js"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import { Button } from "@/components/ui/button"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"
  import { Textarea } from "@/components/ui/textarea"
  import * as Select from "@/components/ui/select"
  import { Switch } from "@/components/ui/switch"
  import { Separator } from "@/components/ui/separator"

  type Props = { active?: boolean }
  let { active = false }: Props = $props()

  let defs = $state<CustomFieldDef[]>([])
  let loadingDefs = $state(false)
  let error = $state<string | null>(null)
  let loadedOnce = $state(false)

  async function loadDefs() {
    if (loadingDefs) return
    error = null
    loadingDefs = true
    try {
      defs = await settingsService.customFields()
      loadedOnce = true
    } catch (err) {
      console.error("[fields] Failed to load custom fields", err)
      error = err instanceof Error ? err.message : "Failed to load custom fields."
    } finally {
      loadingDefs = false
    }
  }

  $effect(() => {
    if (!active) return
    if (loadedOnce) return
    void loadDefs()
  })

  const SCOPE_OPTIONS: Array<{ value: CustomFieldScope; label: string }> = [
    { value: "character", label: "Character (Player + NPC)" },
    { value: "world", label: "World" },
  ]

  const VALUE_TYPE_OPTIONS: Array<{ value: CustomFieldValueType; label: string }> = [
    { value: "text", label: "Text" },
    { value: "list", label: "List of text" },
  ]

  function placementOptions(scope: CustomFieldScope): Array<{ value: CustomFieldDef["placement"]; label: string }> {
    return scope === "character"
      ? [
          { value: "base", label: "Base context" },
          { value: "current", label: "Current state" },
        ]
      : [
          { value: "context", label: "Scene/time context" },
          { value: "memory", label: "Memory section" },
        ]
  }

  type NewFieldDraft = {
    id: string
    scope: CustomFieldScope
    value_type: CustomFieldValueType
    label: string
    placement: CustomFieldDef["placement"]
    prompt: string
  }

  let create = $state<NewFieldDraft>({
    id: "",
    scope: "character",
    value_type: "text",
    label: "",
    placement: "base",
    prompt: "",
  })

  let creating = $state(false)

  function normalizeSlug(raw: string): string {
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
  }

  async function createField() {
    if (creating) return
    error = null
    const id = normalizeSlug(create.id)
    const label = create.label.trim()
    if (!id || !label) {
      error = "Custom field id and label are required."
      return
    }
    creating = true
    try {
      const saved = await settingsService.upsertCustomField({
        id,
        scope: create.scope,
        value_type: create.value_type,
        label,
        placement: create.placement,
        prompt: create.prompt,
        enabled: true,
        sort_order: 0,
      })
      defs = [...defs.filter((d) => d.id !== saved.id), saved].sort((a, b) => {
        if (a.scope !== b.scope) return a.scope.localeCompare(b.scope)
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
        return a.label.localeCompare(b.label)
      })
      create = { ...create, id: "", label: "", prompt: "" }
    } catch (err) {
      console.error("[fields] Failed to create custom field", err)
      error = err instanceof Error ? err.message : "Failed to create custom field."
    } finally {
      creating = false
    }
  }

  type FieldDraft = Omit<CustomFieldDef, "created_at" | "updated_at">
  let editingId = $state<string | null>(null)
  let draft = $state<FieldDraft | null>(null)
  let saving = $state(false)
  let deleting = $state(false)

  function startEdit(def: CustomFieldDef) {
    editingId = def.id
    draft = {
      id: def.id,
      scope: def.scope,
      value_type: def.value_type,
      label: def.label,
      placement: def.placement,
      prompt: def.prompt ?? "",
      enabled: def.enabled,
      sort_order: def.sort_order ?? 0,
    }
  }

  function cancelEdit() {
    editingId = null
    draft = null
  }

  async function saveEdit() {
    if (!draft || saving) return
    saving = true
    error = null
    try {
      const saved = await settingsService.upsertCustomField(draft)
      defs = defs.map((d) => (d.id === saved.id ? saved : d))
      cancelEdit()
    } catch (err) {
      console.error("[fields] Failed to save custom field", err)
      error = err instanceof Error ? err.message : "Failed to save custom field."
    } finally {
      saving = false
    }
  }

  async function removeField(id: string) {
    if (deleting) return
    if (typeof window !== "undefined") {
      const ok = window.confirm(`Delete custom field \"${id}\"? This does not remove existing stored values.`)
      if (!ok) return
    }
    deleting = true
    error = null
    try {
      await settingsService.deleteCustomField(id)
      defs = defs.filter((d) => d.id !== id)
      if (editingId === id) cancelEdit()
    } catch (err) {
      console.error("[fields] Failed to delete custom field", err)
      error = err instanceof Error ? err.message : "Failed to delete custom field."
    } finally {
      deleting = false
    }
  }
</script>

<Card>
  <CardHeader>
    <CardTitle>Custom Fields</CardTitle>
    <CardDescription>Create user-defined fields for characters (player + NPCs) and world state.</CardDescription>
  </CardHeader>
  <CardContent class="space-y-5">
    {#if error}
      <div class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
    {/if}

    <div class="space-y-3 rounded-md border bg-card/50 p-4">
      <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Create</div>
      <div class="grid gap-3 md:grid-cols-2">
        <div class="space-y-2">
          <Label for="new-field-id">Id (slug)</Label>
          <Input
            id="new-field-id"
            placeholder="e.g. mood"
            value={create.id}
            oninput={(e) => (create.id = (e.target as HTMLInputElement).value)}
            disabled={creating}
          />
        </div>
        <div class="space-y-2">
          <Label for="new-field-label">Label</Label>
          <Input
            id="new-field-label"
            placeholder="e.g. Mood"
            value={create.label}
            oninput={(e) => (create.label = (e.target as HTMLInputElement).value)}
            disabled={creating}
          />
        </div>
        <div class="space-y-2">
          <Label>Scope</Label>
          <Select.Root
            type="single"
            value={create.scope}
            items={SCOPE_OPTIONS}
            onValueChange={(v) => {
              create.scope = v as CustomFieldScope
              create.placement = placementOptions(create.scope)[0]!.value
            }}
          >
            <Select.Trigger class="w-full" aria-label="Scope">
              {SCOPE_OPTIONS.find((o) => o.value === create.scope)?.label ?? "Select…"}
            </Select.Trigger>
            <Select.Content>
              {#each SCOPE_OPTIONS as option (option.value)}
                <Select.Item {...option} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="space-y-2">
          <Label>Type</Label>
          <Select.Root
            type="single"
            value={create.value_type}
            items={VALUE_TYPE_OPTIONS}
            onValueChange={(v) => (create.value_type = v as CustomFieldValueType)}
          >
            <Select.Trigger class="w-full" aria-label="Type">
              {VALUE_TYPE_OPTIONS.find((o) => o.value === create.value_type)?.label ?? "Select…"}
            </Select.Trigger>
            <Select.Content>
              {#each VALUE_TYPE_OPTIONS as option (option.value)}
                <Select.Item {...option} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="space-y-2 md:col-span-2">
          <Label>Placement</Label>
          {#if true}
            {@const placements = placementOptions(create.scope)}
            <Select.Root
              type="single"
              value={create.placement}
              items={placements}
              onValueChange={(v) => (create.placement = v as CustomFieldDef["placement"])}
            >
              <Select.Trigger class="w-full" aria-label="Placement">
                {placements.find((o) => o.value === create.placement)?.label ?? "Select…"}
              </Select.Trigger>
              <Select.Content>
                {#each placements as option (option.value)}
                  <Select.Item {...option} />
                {/each}
              </Select.Content>
            </Select.Root>
          {/if}
        </div>
        <div class="space-y-2 md:col-span-2">
          <Label for="new-field-prompt">Prompt (schema description)</Label>
          <Textarea
            id="new-field-prompt"
            rows={4}
            value={create.prompt}
            oninput={(e) => (create.prompt = (e.target as HTMLTextAreaElement).value)}
            disabled={creating}
          />
        </div>
      </div>
      <div class="flex justify-end">
        <Button onclick={createField} disabled={creating || loadingDefs}
          >{creating ? "Creating..." : "Create field"}</Button
        >
      </div>
    </div>

    <Separator />

    {#if defs.length === 0}
      <div class="text-sm text-muted-foreground">{loadingDefs ? "Loading…" : "No custom fields yet."}</div>
    {:else}
      <div class="space-y-3">
        {#each defs as def (def.id)}
          {@const isEditing = editingId === def.id}
          <div class={cn("rounded-md border p-4", isEditing && "border-primary/60 ring-1 ring-primary/20")}>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-foreground">{def.label}</div>
                <div class="text-xs text-muted-foreground">
                  {def.scope} · {def.value_type} · <span class="font-mono">{def.id}</span>
                </div>
              </div>
              {#if !isEditing}
                <div class="flex items-center gap-2">
                  <Button variant="outline" size="sm" onclick={() => startEdit(def)}>Edit</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    class="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onclick={() => removeField(def.id)}
                    disabled={deleting}
                  >
                    Delete
                  </Button>
                </div>
              {/if}
            </div>

            {#if isEditing && draft}
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <div class="space-y-2">
                  <Label>Id</Label>
                  <Input value={draft.id} disabled />
                </div>
                <div class="space-y-2">
                  <Label>Label</Label>
                  <Input value={draft.label} oninput={(e) => (draft!.label = (e.target as HTMLInputElement).value)} />
                </div>
                <div class="space-y-2">
                  <Label>Scope</Label>
                  <Select.Root
                    type="single"
                    value={draft.scope}
                    items={SCOPE_OPTIONS}
                    onValueChange={(v) => {
                      draft!.scope = v as CustomFieldScope
                      draft!.placement = placementOptions(draft!.scope)[0]!.value
                    }}
                  >
                    <Select.Trigger class="w-full" aria-label="Scope">
                      {SCOPE_OPTIONS.find((o) => o.value === draft.scope)?.label ?? "Select…"}
                    </Select.Trigger>
                    <Select.Content>
                      {#each SCOPE_OPTIONS as option (option.value)}
                        <Select.Item {...option} />
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
                <div class="space-y-2">
                  <Label>Type</Label>
                  <Select.Root
                    type="single"
                    value={draft.value_type}
                    items={VALUE_TYPE_OPTIONS}
                    onValueChange={(v) => (draft!.value_type = v as CustomFieldValueType)}
                  >
                    <Select.Trigger class="w-full" aria-label="Type">
                      {VALUE_TYPE_OPTIONS.find((o) => o.value === draft.value_type)?.label ?? "Select…"}
                    </Select.Trigger>
                    <Select.Content>
                      {#each VALUE_TYPE_OPTIONS as option (option.value)}
                        <Select.Item {...option} />
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
                <div class="space-y-2 md:col-span-2">
                  <Label>Placement</Label>
                  {#if true}
                    {@const placements = placementOptions(draft.scope)}
                    <Select.Root
                      type="single"
                      value={draft.placement}
                      items={placements}
                      onValueChange={(v) => (draft!.placement = v as CustomFieldDef["placement"])}
                    >
                      <Select.Trigger class="w-full" aria-label="Placement">
                        {placements.find((o) => o.value === draft.placement)?.label ?? "Select…"}
                      </Select.Trigger>
                      <Select.Content>
                        {#each placements as option (option.value)}
                          <Select.Item {...option} />
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  {/if}
                </div>
                <div class="space-y-2 md:col-span-2">
                  <Label>Prompt</Label>
                  <Textarea
                    rows={4}
                    value={draft.prompt}
                    oninput={(e) => (draft!.prompt = (e.target as HTMLTextAreaElement).value)}
                  />
                </div>
                <div class="space-y-2">
                  <Label>Enabled</Label>
                  <div class="flex h-10 items-center">
                    <Switch checked={draft.enabled} onCheckedChange={(v) => (draft!.enabled = v)} />
                  </div>
                </div>
                <div class="space-y-2">
                  <Label>Sort order</Label>
                  <Input
                    value={String(draft.sort_order)}
                    oninput={(e) => (draft!.sort_order = Number((e.target as HTMLInputElement).value) || 0)}
                  />
                </div>
              </div>

              <div class="mt-4 flex items-center justify-end gap-2">
                <Button variant="outline" onclick={cancelEdit} disabled={saving}>Cancel</Button>
                <Button onclick={saveEdit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </CardContent>
</Card>
