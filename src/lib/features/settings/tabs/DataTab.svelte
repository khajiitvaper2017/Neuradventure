<script lang="ts">
  import { backup as backupService } from "@/services/backup"
  import { showConfirm, showError, showQuietNotice } from "@/stores/ui"
  import { pickFile } from "@/utils/dom/filePick"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import { Database, Download, Upload } from "@lucide/svelte"

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

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <Database class="size-4 text-muted-foreground" aria-hidden="true" />
      Backup
    </CardTitle>
    <CardDescription
      >Export a backup file for this device, or restore one to overwrite your local library.</CardDescription
    >
  </CardHeader>

  <CardContent>
    <div class="grid gap-2 sm:grid-cols-2">
      <Button variant="outline" class="w-full justify-center gap-2" onclick={exportBackup}>
        <Download class="size-4" aria-hidden="true" />
        Export backup
      </Button>
      <Button variant="destructive" class="w-full justify-center gap-2" onclick={restoreBackup}>
        <Upload class="size-4" aria-hidden="true" />
        Restore backup
      </Button>
    </div>
  </CardContent>
</Card>
