<script lang="ts">
  import type { ChatMember } from "@/types/types"
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog"
  import { Button } from "@/components/ui/button"

  type Props = {
    open?: boolean
    disabled?: boolean
    members?: ChatMember[]
    onPick?: (memberId: number) => void
    onClose?: () => void
  }

  let { open = false, disabled = false, members = [], onPick, onClose }: Props = $props()

  function close() {
    if (disabled) return
    onClose?.()
  }
</script>

<Dialog
  {open}
  onOpenChange={(next) => {
    if (!next && open) close()
  }}
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Next Speaker</DialogTitle>
      <DialogDescription>Choose which AI should reply next.</DialogDescription>
    </DialogHeader>

    <div class="grid gap-2">
      {#each members as member (member.id)}
        <Button variant="secondary" class="justify-start" onclick={() => onPick?.(member.id)} {disabled}>
          {member.name}
        </Button>
      {/each}
    </div>

    <DialogFooter class="mt-2">
      <Button variant="outline" onclick={close} {disabled}>Close</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
