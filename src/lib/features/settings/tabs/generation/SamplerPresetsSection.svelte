<script lang="ts">
  import type { GenerationParams, SamplerPreset } from "@/shared/api-types"
  import { settings as settingsService } from "@/services/settings"
  import { generation } from "@/stores/settings"
  import { loadPresets, presets, refreshPresets } from "@/utils/presets"
  import { coercePresetFromJson, filenameToPresetName } from "@/features/settings/lib/presetImport"

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

  let importFileInput: HTMLInputElement | null = $state(null)

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

  async function handleImportPresetJson(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ""
    if (!file) return
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

  function openImportPreset() {
    importFileInput?.click()
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

<div class="control-section-label">Sampler Presets</div>
<div class="preset-row">
  <input
    class="hidden-input"
    type="file"
    accept="application/json,.json"
    bind:this={importFileInput}
    onchange={handleImportPresetJson}
  />

  <button class="preset-btn preset-import" onclick={openImportPreset} title="Import a JSON preset file"
    >Import JSON</button
  >
  {#each $presets as preset (preset.id ?? preset.name)}
    <div class="preset-item">
      <button
        class="preset-btn"
        class:active={activePreset === preset.name}
        onclick={() => applyPreset(preset.name)}
        title={preset.description}
      >
        {preset.name}
      </button>
      {#if preset.id}
        <button class="preset-btn preset-del" onclick={() => deletePreset(preset)} title="Delete custom preset"
          >×</button
        >
      {/if}
    </div>
  {/each}
  {#if activePreset === "Custom"}
    <span class="preset-btn custom-badge">Custom</span>
  {/if}
</div>

<style>
  .hidden-input {
    display: none;
  }

  .preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.6rem 1rem 0.8rem;
  }

  .preset-item {
    display: flex;
    gap: 0.35rem;
    align-items: center;
  }

  .preset-btn.active {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-dim);
  }

  .preset-btn.preset-import {
    color: var(--accent);
    border-color: var(--accent-dim);
  }

  .preset-btn.preset-del {
    padding: 0.4rem 0.55rem;
    color: var(--danger);
    border-color: rgba(181, 64, 64, 0.5);
  }

  .preset-btn.preset-del:hover {
    border-color: var(--danger);
    color: var(--danger);
  }

  .custom-badge {
    cursor: default;
    font-style: italic;
    opacity: 0.7;
  }
</style>
