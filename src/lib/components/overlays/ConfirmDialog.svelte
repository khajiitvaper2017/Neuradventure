<script lang="ts">
  import { confirmDialog, resolveConfirm } from "@/stores/ui"
  import { AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialog } from "@/components/ui/alert-dialog"
  import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

  const open = $derived(!!$confirmDialog)
</script>

<AlertDialog
  {open}
  onOpenChange={(next) => {
    if (!next && $confirmDialog) resolveConfirm(false)
  }}
>
  {#if $confirmDialog}
    <AlertDialogContent>
      <DialogHeader>
        <DialogTitle>{$confirmDialog.title}</DialogTitle>
        <DialogDescription>{$confirmDialog.message}</DialogDescription>
      </DialogHeader>
      <DialogFooter class="mt-2">
        <AlertDialogCancel onclick={() => resolveConfirm(false)}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          class={$confirmDialog.danger ? "bg-destructive hover:bg-destructive/90" : undefined}
          onclick={() => resolveConfirm(true)}
        >
          {$confirmDialog.confirmLabel || "Confirm"}
        </AlertDialogAction>
      </DialogFooter>
    </AlertDialogContent>
  {/if}
</AlertDialog>
