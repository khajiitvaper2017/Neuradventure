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
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"

  export let open = false
  export let disabled = false
  export let titleDraft = ""

  export let onCancel: (() => void) | undefined = undefined
  export let onSave: (() => void) | undefined = undefined
</script>

<Dialog
  {open}
  onOpenChange={(next) => {
    if (!next && open) onCancel?.()
  }}
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Chat Title</DialogTitle>
      <DialogDescription>Rename this chat.</DialogDescription>
    </DialogHeader>

    <div class="space-y-2">
      <Label for="chat-title">Title</Label>
      <Input id="chat-title" type="text" bind:value={titleDraft} {disabled} />
    </div>

    <DialogFooter class="mt-2">
      <Button variant="outline" onclick={onCancel} {disabled}>Cancel</Button>
      <Button onclick={onSave} {disabled}>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
