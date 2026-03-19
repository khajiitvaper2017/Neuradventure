<script lang="ts">
  import type { CustomFieldDef } from "@/types/api"
  import { Button } from "@/components/ui/button"
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog"
  import CustomFieldsEditor from "@/components/inputs/CustomFieldsEditor.svelte"

  type Props = {
    open?: boolean
    disabled?: boolean
    defs?: CustomFieldDef[]
    values?: Record<string, string | string[]>
    setValues?: (next: Record<string, string | string[]>) => void
    onCancel?: () => void
    onSave?: () => void
  }

  let {
    open = false,
    disabled = false,
    defs = [],
    values = {},
    setValues = () => {},
    onCancel,
    onSave,
  }: Props = $props()

  const hasEnabledWorldFields = $derived(defs.some((d) => d.enabled && d.scope === "world"))
</script>

<Dialog
  {open}
  onOpenChange={(next) => {
    if (!next && open) onCancel?.()
  }}
>
  <DialogContent class="max-w-xl">
    <DialogHeader>
      <DialogTitle>World Fields</DialogTitle>
      <DialogDescription>
        Custom world state fields shown in the scene context and updated by the model via structured output.
      </DialogDescription>
    </DialogHeader>

    {#if !hasEnabledWorldFields}
      <div class="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        No enabled world fields. Create them in <span class="font-medium text-foreground">Settings → Fields</span>.
      </div>
    {:else}
      <div class="space-y-2">
        <div class="text-sm font-medium text-foreground">Context</div>
        <div class="text-xs text-muted-foreground">Shown near the scene and time context.</div>
        <CustomFieldsEditor {defs} {values} {setValues} scope="world" placement="context" {disabled} />
      </div>
    {/if}

    <DialogFooter class="mt-2">
      <Button variant="outline" onclick={onCancel} {disabled}>Cancel</Button>
      <Button onclick={onSave} {disabled}>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
