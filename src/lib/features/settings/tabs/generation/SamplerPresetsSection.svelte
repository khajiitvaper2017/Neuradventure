<script lang="ts">
  import type { GenerationParams, SamplerPreset } from "@/shared/api-types"
  import { settings as settingsService } from "@/services/settings"
  import { generation } from "@/stores/settings"
  import { loadPresets, presets, refreshPresets } from "@/utils/presets"
  import { pickFile } from "@/utils/filePick"
  import { coercePresetFromJson, filenameToPresetName } from "@/features/settings/lib/presetImport"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"

  type Props = {
    active?: boolean
  }

  let { active = false }: Props = $props()

  let presetsLoadedOnce = $state(false)
  $effect(() => {
    if (!active) return
    if (presetsLoadedOnce) return
    presetsLoadedOnce = true
    void loadPresets()
  })

  function detectPreset(gen: GenerationParams, list: SamplerPreset[]): string {
    for (const preset of list) {
      const match = (Object.keys(preset.params) as (keyof GenerationParams)[]).every((k) => gen[k] === preset.params[k])
      if (match) return preset.name
    }
    return "Custom"
  }

  let activePreset = $derived(detectPreset($generation, $presets))

  function applyPreset(name: string) {
    const preset = $presets.find((p: SamplerPreset) => p.name === name)
    if (preset) generation.set({ ...preset.params })
  }

  async function importPresetFile(file: File) {
    try {
      const text = await file.text()
      const raw = JSON.parse(text) as unknown
      const fallbackName = filenameToPresetName(file)
      const preset = coercePresetFromJson(raw, fallbackName, $generation)
      if (!preset) throw new Error("Unrecognized preset JSON format")

      generation.set({ ...preset.params })
      await settingsService.upsertPreset({
        name: preset.name,
        description: preset.description,
        params: preset.params,
      })
      await refreshPresets()
    } catch (err) {
      console.error("[presets] Failed to import preset JSON", err)
    }
  }

  async function openImportPreset() {
    const file = await pickFile({ accept: "application/json,.json" })
    if (!file) return
    await importPresetFile(file)
  }

  async function deletePreset(preset: SamplerPreset) {
    if (!preset.id) return
    if (typeof window !== "undefined") {
      const ok = window.confirm(`Delete preset "${preset.name}"?`)
      if (!ok) return
    }
    try {
      await settingsService.deletePreset(preset.id)
      await refreshPresets()
    } catch (err) {
      console.error("[presets] Failed to delete preset", err)
    }
  }
</script>

<div class="pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sampler Presets</div>
<div class="flex flex-wrap gap-2 pt-2">
  <Button
    variant="outline"
    size="sm"
    class="h-8 rounded-full px-3"
    onclick={openImportPreset}
    title="Import a JSON preset file"
  >
    Import JSON
  </Button>
  {#each $presets as preset (preset.id ?? preset.name)}
    <div class="flex items-center gap-1">
      <Button
        variant={activePreset === preset.name ? "secondary" : "outline"}
        size="sm"
        class="h-8 rounded-full px-3"
        onclick={() => applyPreset(preset.name)}
        title={preset.description}
      >
        {preset.name}
      </Button>
      {#if preset.id}
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onclick={() => deletePreset(preset)}
          title="Delete custom preset"
          aria-label={`Delete preset ${preset.name}`}
        >
          ×
        </Button>
      {/if}
    </div>
  {/each}
  {#if activePreset === "Custom"}
    <Badge variant="outline" class="h-8 rounded-full px-3 font-mono text-[11px] italic text-muted-foreground"
      >Custom</Badge
    >
  {/if}
</div>
