<script lang="ts">
  import type { ChatMember } from "@/shared/types"
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog"
  import { Button } from "@/components/ui/button"

  export let open = false
  export let disabled = false
  export let members: ChatMember[] = []

  export let onPick: ((memberId: number) => void) | undefined = undefined
  export let onClose: (() => void) | undefined = undefined

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
