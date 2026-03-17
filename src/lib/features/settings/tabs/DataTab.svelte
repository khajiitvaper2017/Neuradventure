<script lang="ts">
  import { backup as backupService } from "@/services/backup"
  import { settings as settingsService } from "@/services/settings"
  import { showConfirm, showError, showQuietNotice } from "@/stores/ui"
  import { pickFile } from "@/utils/dom/filePick"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import { Database, Download, RotateCcw, Settings2, Upload } from "@lucide/svelte"

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

  async function resetPromptTemplates() {
    const confirmed = await showConfirm({
      title: "Reset prompt templates",
      message: "Reset ALL prompt template edits back to built-in defaults on this device? This cannot be undone.",
      confirmLabel: "Reset prompts",
      danger: true,
    })
    if (!confirmed) return

    try {
      const result = await settingsService.resetAllPromptTemplates()
      showQuietNotice(`Prompt templates reset (${result.reset})`)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to reset prompt templates")
    }
  }

  async function resetFieldPromptOverrides() {
    const confirmed = await showConfirm({
      title: "Reset field prompt overrides",
      message: "Reset ALL field prompt overrides back to built-in defaults on this device? This cannot be undone.",
      confirmLabel: "Reset field overrides",
      danger: true,
    })
    if (!confirmed) return

    try {
      await settingsService.resetAllFieldPromptOverrides()
      showQuietNotice("Field prompt overrides reset")
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to reset field prompt overrides")
    }
  }

  async function deleteAllCustomFields() {
    const confirmed = await showConfirm({
      title: "Delete all custom fields",
      message:
        "Delete ALL custom field definitions on this device? (Stories keep their stored values.) This cannot be undone.",
      confirmLabel: "Delete custom fields",
      danger: true,
    })
    if (!confirmed) return

    try {
      const result = await settingsService.deleteAllCustomFields()
      showQuietNotice(`Custom fields deleted (${result.deleted})`)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete custom fields")
    }
  }

  async function deleteAllSamplerPresets() {
    const confirmed = await showConfirm({
      title: "Delete all sampler presets",
      message: "Delete ALL saved sampler presets on this device? This cannot be undone.",
      confirmLabel: "Delete presets",
      danger: true,
    })
    if (!confirmed) return

    try {
      const result = await settingsService.deleteAllSamplerPresets()
      showQuietNotice(`Sampler presets deleted (${result.deleted})`)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete sampler presets")
    }
  }

  async function clearAllPromptHistory() {
    const confirmed = await showConfirm({
      title: "Clear prompt history",
      message: "Clear prompt history used in the prompt suggestions list on this device? This cannot be undone.",
      confirmLabel: "Clear history",
      danger: true,
    })
    if (!confirmed) return

    try {
      const result = await settingsService.clearAllPromptHistory()
      showQuietNotice(`Prompt history cleared (${result.deleted})`)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to clear prompt history")
    }
  }

  async function resetSettingsToDefaults() {
    const confirmed = await showConfirm({
      title: "Reset settings",
      message:
        "Reset LLM params, connection settings, story defaults, timeouts, and UI preferences back to defaults on this device? This cannot be undone.",
      confirmLabel: "Reset settings",
      danger: true,
    })
    if (!confirmed) return

    try {
      await settingsService.resetSettingsToDefaults()
      showQuietNotice("Settings reset — reloading…")
      window.setTimeout(() => location.reload(), 250)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to reset settings")
    }
  }

  async function resetConnectorApiKeys() {
    const confirmed = await showConfirm({
      title: "Reset API keys",
      message: "Clear the stored OpenRouter API key on this device? This cannot be undone.",
      confirmLabel: "Clear key",
      danger: true,
    })
    if (!confirmed) return

    try {
      await settingsService.resetConnectorApiKeys()
      showQuietNotice("API keys reset — reloading…")
      window.setTimeout(() => location.reload(), 250)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to reset API keys")
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

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <RotateCcw class="size-4 text-muted-foreground" aria-hidden="true" />
      Reset
    </CardTitle>
    <CardDescription>Each action affects only this device’s local database.</CardDescription>
  </CardHeader>
  <CardContent>
    <div class="grid gap-2 sm:grid-cols-2">
      <Button variant="outline" class="w-full justify-center gap-2" onclick={resetPromptTemplates}>
        <RotateCcw class="size-4" aria-hidden="true" />
        Reset prompt templates
      </Button>
      <Button variant="outline" class="w-full justify-center gap-2" onclick={resetFieldPromptOverrides}>
        <RotateCcw class="size-4" aria-hidden="true" />
        Reset field overrides
      </Button>
      <Button variant="destructive" class="w-full justify-center gap-2" onclick={deleteAllCustomFields}>
        <RotateCcw class="size-4" aria-hidden="true" />
        Delete custom fields
      </Button>
      <Button variant="destructive" class="w-full justify-center gap-2" onclick={deleteAllSamplerPresets}>
        <RotateCcw class="size-4" aria-hidden="true" />
        Delete sampler presets
      </Button>
      <Button variant="destructive" class="w-full justify-center gap-2" onclick={clearAllPromptHistory}>
        <RotateCcw class="size-4" aria-hidden="true" />
        Clear prompt history
      </Button>
      <Button variant="destructive" class="w-full justify-center gap-2" onclick={resetSettingsToDefaults}>
        <Settings2 class="size-4" aria-hidden="true" />
        Reset settings & params
      </Button>
      <Button variant="destructive" class="w-full justify-center gap-2 sm:col-span-2" onclick={resetConnectorApiKeys}>
        <Settings2 class="size-4" aria-hidden="true" />
        Clear OpenRouter API key
      </Button>
    </div>
  </CardContent>
</Card>
