<script lang="ts">
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog"
  import { Button } from "@/components/ui/button"
  import { Textarea } from "@/components/ui/textarea"

  type Props = {
    open?: boolean
    disabled?: boolean
    draft?: string
    onCancel?: () => void
    onSave?: () => void
  }

  let { open = false, disabled = false, draft = $bindable(""), onCancel, onSave }: Props = $props()
</script>

<Dialog
  {open}
  onOpenChange={(next) => {
    if (!next && open) onCancel?.()
  }}
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Memory</DialogTitle>
      <DialogDescription>Persistent summary — updated by AI each turn, editable by you.</DialogDescription>
    </DialogHeader>
    <Textarea bind:value={draft} rows={6} {disabled}></Textarea>
    <DialogFooter class="mt-2">
      <Button variant="outline" onclick={onCancel} {disabled}>Cancel</Button>
      <Button onclick={onSave} {disabled}>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
