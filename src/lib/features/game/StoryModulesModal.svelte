<script lang="ts">
  import type { StoryModules } from "@/shared/types"
  import StoryModulesPanel from "@/components/panels/StoryModulesPanel.svelte"
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog"
  import { Button } from "@/components/ui/button"
  import { ScrollArea } from "@/components/ui/scroll-area"

  type Props = {
    open?: boolean
    disabled?: boolean
    modules: StoryModules
    onCancel?: () => void
    onSave?: () => void
  }

  let { open = false, disabled = false, modules = $bindable(), onCancel, onSave }: Props = $props()
</script>

<Dialog
  {open}
  onOpenChange={(next) => {
    if (!next && open) onCancel?.()
  }}
>
  <DialogContent class="max-w-4xl">
    <DialogHeader>
      <DialogTitle>Story Modules</DialogTitle>
      <DialogDescription>Control which mechanics are tracked for this story.</DialogDescription>
    </DialogHeader>
    <ScrollArea class="max-h-[70dvh] border-y">
      <div class="px-4 py-3">
        <StoryModulesPanel {modules} setModules={(next) => (modules = next)} bare />
      </div>
    </ScrollArea>
    <DialogFooter class="mt-3">
      <Button variant="outline" onclick={onCancel} {disabled}>Cancel</Button>
      <Button onclick={onSave} {disabled}>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
