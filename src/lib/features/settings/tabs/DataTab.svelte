<script lang="ts">
  import { backup as backupService } from "@/services/backup"
  import { showConfirm, showError, showQuietNotice } from "@/stores/ui"
  import { pickFile } from "@/utils/filePick"
  import { Button } from "@/components/ui/button"

  async function exportBackup() {
    try {
      await backupService.exportAllAndDownload()
      showQuietNotice("Backup downloaded")
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to export backup")
    }
  }

  async function restoreBackup() {
    const confirmed = await showConfirm({
      title: "Restore backup",
      message:
        "Restore a backup file and overwrite your local library on this device for this site? This cannot be undone.",
      confirmLabel: "Restore",
      danger: true,
    })
    if (!confirmed) return

    const file = await pickFile({ accept: ".ndbackup,.json,application/json" })
    if (!file) return
    try {
      await backupService.restoreAllFromFile(file)
      showQuietNotice("Backup restored — reloading…")
      window.setTimeout(() => location.reload(), 250)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to restore backup")
    }
  }
</script>

<div class="space-y-4">
  <div class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data</div>

  <div class="flex flex-col gap-3 rounded-lg border bg-card p-4">
    <div class="space-y-1">
      <div class="text-sm font-medium text-foreground">Backup</div>
      <div class="text-xs text-muted-foreground">
        Export a backup file for this device, or restore one to overwrite your local library.
      </div>
    </div>

    <div class="grid gap-2 sm:grid-cols-2">
      <Button variant="outline" class="w-full" onclick={exportBackup}>Export backup</Button>
      <Button variant="destructive" class="w-full" onclick={restoreBackup}>Restore backup</Button>
    </div>
  </div>
</div>
