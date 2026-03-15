<script lang="ts">
  import type { GenerationParams, LLMConnector, ModelInfo, SamplerPreset } from "@/shared/api-types"
  import { settings as settingsService } from "@/services/settings"
  import Select from "@/components/controls/Select.svelte"
  import TimeoutsSection from "@/features/settings/tabs/generation/TimeoutsSection.svelte"
  import { isChatGenerating } from "@/stores/chat"
  import { isGenerating } from "@/stores/game"
  import {
    authorNoteEnabled,
    connector,
    ctxLimitDetected,
    defaultAuthorNote,
    defaultAuthorNoteDepth,
    defaultAuthorNoteEmbedState,
    defaultAuthorNoteInterval,
    defaultAuthorNotePosition,
    defaultAuthorNoteRole,
    generation,
    streamingEnabled,
  } from "@/stores/settings"
  import { loadPresets, presets, refreshPresets } from "@/utils/presets"
  import { repetitionParams, samplingParams } from "@/features/settings/lib/generationParamDefs"
  import { getOpenRouterParamStatus } from "@/features/settings/lib/openrouterParams"
  import { buildModelSelectOptions, filterModelResults } from "@/features/settings/lib/openrouterModels"
  import { coercePresetFromJson, filenameToPresetName } from "@/features/settings/lib/presetImport"

  type Props = {
    active?: boolean
    modelSearchResults: ModelInfo[]
  }

  let { active = false, modelSearchResults = $bindable() }: Props = $props()

  const OPENROUTER_DEFAULT_MODEL = "openrouter/free"
  const OPENROUTER_PINNED_MODELS: Array<{ id: string; label: string }> = [
    { id: OPENROUTER_DEFAULT_MODEL, label: `${OPENROUTER_DEFAULT_MODEL} · default` },
    { id: "openrouter/auto", label: "openrouter/auto · auto" },
  ]

  const connectorTypeOptions = [
    { value: "koboldcpp", label: "KoboldCpp" },
    { value: "openrouter", label: "OpenRouter" },
  ]

  let generationLockActive = $state(false)
  $effect(() => {
    generationLockActive = $isGenerating || $isChatGenerating
  })

  let presetsLoadedOnce = $state(false)
  $effect(() => {
    if (!active) return
    if (presetsLoadedOnce) return
    presetsLoadedOnce = true
    void loadPresets()
  })

  // Local copies for text inputs (committed on blur/enter)
  let connectorUrl = $state($connector.url)
  let connectorApiKey = $state($connector.api_keys[$connector.type])
  let openrouterModelDraft = $state($connector.type === "openrouter" ? $connector.model : OPENROUTER_DEFAULT_MODEL)
  let modelSearchQuery = $state("")
  let modelSearchLoading = $state(false)
  let modelSearchError = $state<string | null>(null)
  let modelSearchOnlyFree = $state(false)
  let modelSearchOnlyJsonSchema = $state(false)
  let authorNoteDraft = $state($defaultAuthorNote)
  let authorNoteDepthDraft = $state($defaultAuthorNoteDepth)
  let authorNotePositionDraft = $state($defaultAuthorNotePosition)
  let authorNoteIntervalDraft = $state($defaultAuthorNoteInterval)
  let authorNoteRoleDraft = $state($defaultAuthorNoteRole)
  let authorNoteEmbedStateDraft = $state($defaultAuthorNoteEmbedState)

  let importFileInput: HTMLInputElement | null = $state(null)

  // Sync local copies when store changes externally
  $effect(() => {
    connectorUrl = $connector.url
  })
  $effect(() => {
    connectorApiKey = $connector.api_keys[$connector.type]
  })
  $effect(() => {
    if ($connector.type === "openrouter") {
      openrouterModelDraft = $connector.model
    }
  })
  $effect(() => {
    authorNoteDraft = $defaultAuthorNote
  })
  $effect(() => {
    authorNoteDepthDraft = $defaultAuthorNoteDepth
  })
  $effect(() => {
    authorNotePositionDraft = $defaultAuthorNotePosition
  })
  $effect(() => {
    authorNoteIntervalDraft = $defaultAuthorNoteInterval
  })
  $effect(() => {
    authorNoteRoleDraft = $defaultAuthorNoteRole
  })
  $effect(() => {
    authorNoteEmbedStateDraft = $defaultAuthorNoteEmbedState
  })

  function commitConnector() {
    const trimmedUrl = connectorUrl.trim()
    const trimmedKey = connectorApiKey.trim()
    if (!trimmedUrl) return

    if ($connector.type === "openrouter") {
      if (!trimmedKey) return
      if (trimmedUrl !== $connector.url || trimmedKey !== $connector.api_keys.openrouter) {
        connector.set({
          ...$connector,
          url: trimmedUrl,
          api_keys: { ...$connector.api_keys, openrouter: trimmedKey },
        })
      }
      return
    }

    if (trimmedUrl !== $connector.url || trimmedKey !== $connector.api_keys.koboldcpp) {
      connector.set({
        ...$connector,
        url: trimmedUrl,
        api_keys: { ...$connector.api_keys, koboldcpp: trimmedKey },
      })
    }
  }

  function setConnectorType(nextType: LLMConnector["type"]) {
    if (nextType === $connector.type) return
    if (nextType === "openrouter") {
      connector.set({
        type: "openrouter",
        url: "https://openrouter.ai/api/v1",
        api_keys: {
          ...$connector.api_keys,
          koboldcpp: $connector.api_keys.koboldcpp.trim() ? $connector.api_keys.koboldcpp.trim() : "kobold",
          openrouter: $connector.api_keys.openrouter.trim(),
        },
        model: OPENROUTER_DEFAULT_MODEL,
      })
      return
    }
    connector.set({
      type: "koboldcpp",
      url: "http://localhost:5001/v1",
      api_keys: {
        ...$connector.api_keys,
        koboldcpp: $connector.api_keys.koboldcpp.trim() ? $connector.api_keys.koboldcpp.trim() : "kobold",
        openrouter: $connector.api_keys.openrouter.trim(),
      },
    })
  }

  function commitOpenRouterModel() {
    if ($connector.type !== "openrouter") return
    const trimmed = openrouterModelDraft.trim()
    if (!trimmed) return
    if (trimmed !== $connector.model) {
      connector.set({ ...$connector, model: trimmed })
    }
  }

  async function searchModels() {
    modelSearchLoading = true
    modelSearchError = null
    try {
      const res = await settingsService.models(modelSearchQuery, 200)
      modelSearchResults = Array.isArray(res.models) ? res.models : []
    } catch (err) {
      modelSearchResults = []
      modelSearchError = err instanceof Error ? err.message : String(err)
    } finally {
      modelSearchLoading = false
    }
  }

  function mergeModels(existing: ModelInfo[], incoming: ModelInfo[]): ModelInfo[] {
    if (!incoming.length) return existing
    const seen = new Set(existing.map((m) => m.id))
    const out = [...existing]
    for (const m of incoming) {
      if (!m.id || seen.has(m.id)) continue
      seen.add(m.id)
      out.push(m)
    }
    return out
  }

  $effect(() => {
    if (!active) return
    if ($connector.type !== "openrouter") return

    const currentId = $connector.model.trim()
    if (!currentId) return
    const existing = modelSearchResults.find((m) => m.id === currentId) ?? null
    if (existing?.supported_parameters && existing.supported_parameters.length > 0) return
    if (modelSearchLoading) return

    const q = currentId
    modelSearchLoading = true
    modelSearchError = null
    void settingsService
      .models(q, 25)
      .then((res) => {
        const models = Array.isArray(res.models) ? res.models : []
        modelSearchResults = mergeModels(modelSearchResults, models)
      })
      .catch((err) => {
        modelSearchError = err instanceof Error ? err.message : String(err)
      })
      .finally(() => {
        modelSearchLoading = false
      })
  })

  let ctxRefreshLoading = $state(false)
  async function refreshCtxLimitDetected() {
    ctxRefreshLoading = true
    try {
      const res = await settingsService.get()
      ctxLimitDetected.set(res.ctx_limit_detected ?? 0)
    } catch {
      // ignore
    } finally {
      ctxRefreshLoading = false
    }
  }

  const pinnedTags = (id: string): string[] => {
    if (id === OPENROUTER_DEFAULT_MODEL) return ["default"]
    if (id === "openrouter/auto") return ["auto"]
    return []
  }

  let filteredModelSearchResults = $derived.by(() =>
    filterModelResults(modelSearchResults, {
      onlyFree: modelSearchOnlyFree,
      onlyJsonSchema: modelSearchOnlyJsonSchema,
    }),
  )

  let modelSelectOptions = $derived.by(() =>
    buildModelSelectOptions({
      models: modelSearchResults,
      currentModel: $connector.type === "openrouter" ? $connector.model : "",
      pinned: OPENROUTER_PINNED_MODELS,
      pinnedTags,
      onlyFree: modelSearchOnlyFree,
      onlyJsonSchema: modelSearchOnlyJsonSchema,
    }),
  )

  function pickOpenRouterModel(nextId: string) {
    if ($connector.type !== "openrouter") return
    const trimmed = nextId.trim()
    if (!trimmed) return
    openrouterModelDraft = trimmed
    if (trimmed !== $connector.model) {
      connector.set({ ...$connector, model: trimmed })
    }
  }

  let unsupportedParamLabels = $derived.by(() => {
    if ($connector.type !== "openrouter") return []
    const model = modelSearchResults.find((m) => m.id === $connector.model)
    if (!model?.supported_parameters) return []
    const allParams = [...samplingParams, ...repetitionParams]
    return allParams.filter((p) => getOpenRouterParamStatus(p.key, model) === "unsupported").map((p) => p.label)
  })

  function commitAuthorNote() {
    const trimmedNote = authorNoteDraft.trim()
    const nextDepthRaw = Number(authorNoteDepthDraft)
    const nextDepth = Number.isFinite(nextDepthRaw) ? Math.min(100, Math.max(0, Math.floor(nextDepthRaw))) : 4
    const nextPositionRaw = Number(authorNotePositionDraft)
    const nextPosition = Number.isFinite(nextPositionRaw) ? Math.min(2, Math.max(0, Math.floor(nextPositionRaw))) : 1
    const nextIntervalRaw = Number(authorNoteIntervalDraft)
    const nextInterval = Number.isFinite(nextIntervalRaw) ? Math.min(1000, Math.max(0, Math.floor(nextIntervalRaw))) : 1
    const nextRoleRaw = Number(authorNoteRoleDraft)
    const nextRole = Number.isFinite(nextRoleRaw) ? Math.min(2, Math.max(0, Math.floor(nextRoleRaw))) : 0
    if (trimmedNote !== $defaultAuthorNote) {
      defaultAuthorNote.set(trimmedNote)
    }
    if (nextDepth !== $defaultAuthorNoteDepth) {
      defaultAuthorNoteDepth.set(nextDepth)
    }
    if (nextPosition !== $defaultAuthorNotePosition) {
      defaultAuthorNotePosition.set(nextPosition)
    }
    if (nextInterval !== $defaultAuthorNoteInterval) {
      defaultAuthorNoteInterval.set(nextInterval)
    }
    if (nextRole !== $defaultAuthorNoteRole) {
      defaultAuthorNoteRole.set(nextRole)
    }
    if (authorNoteEmbedStateDraft !== $defaultAuthorNoteEmbedState) {
      defaultAuthorNoteEmbedState.set(authorNoteEmbedStateDraft)
    }
  }

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

{#if unsupportedParamLabels.length > 0}
  <div class="notice notice--warning" role="note">
    <div class="notice__row">
      <span class="notice__icon" aria-hidden="true">⚠</span>
      <div>
        <div class="notice__title">Unsupported parameters</div>
        <div class="notice__body">
          <strong>{$connector.type === "openrouter" ? $connector.model : ""}</strong> does not support:
          {unsupportedParamLabels.join(", ")}. These parameters will be ignored.
        </div>
      </div>
    </div>
  </div>
{/if}

<div class="control-section-label section-head">
  <span>Connection</span>
  <div class="section-head__actions">
    {#if generationLockActive}
      <span
        class="stream-lock-pill"
        title="A generation is in progress; connection controls are locked until it completes"
      >
        Generating…
      </span>
    {/if}
  </div>
</div>

<div class="control-row control-row--input" class:control-row--disabled={generationLockActive}>
  <span class="control-row-text">
    <span class="control-row-title">Backend</span>
    <span class="control-row-sub">Provider for the OpenAI-compatible API endpoint</span>
  </span>
  <Select
    value={$connector.type}
    options={connectorTypeOptions}
    ariaLabel="Backend"
    width="200px"
    disabled={generationLockActive}
    onChange={setConnectorType}
  />
</div>

<div class="control-row control-row--input" class:control-row--disabled={generationLockActive}>
  <span class="control-row-text">
    <span class="control-row-title">Ctx Limit (Detected)</span>
    <span class="control-row-sub">Fetched from the current provider (cached)</span>
  </span>
  <div class="ctx-limit-actions">
    <span class="connector-badge">{$ctxLimitDetected > 0 ? $ctxLimitDetected : "Unknown"}</span>
    <button
      class="preset-btn ctx-refresh"
      disabled={ctxRefreshLoading || generationLockActive}
      onclick={refreshCtxLimitDetected}
    >
      {ctxRefreshLoading ? "Refreshing…" : "Refresh"}
    </button>
  </div>
</div>

<label class="control-row" class:control-row--disabled={generationLockActive}>
  <span class="control-row-text">
    <span class="control-row-title">Use streaming</span>
    <span class="control-row-sub">Stream model output while generating (enables partial output via WebSocket)</span>
  </span>
  <input type="checkbox" bind:checked={$streamingEnabled} disabled={generationLockActive} />
</label>

<div class="divider"></div>

<TimeoutsSection disabled={generationLockActive} />

<label class="control-row control-row--input" class:control-row--disabled={generationLockActive}>
  <span class="control-row-text">
    <span class="control-row-title">API URL</span>
  </span>
  <input
    class="text-input"
    type="text"
    bind:value={connectorUrl}
    disabled={generationLockActive}
    onblur={commitConnector}
    onkeydown={(e) => {
      if (e.key === "Enter") (e.target as HTMLInputElement).blur()
    }}
  />
</label>

<label class="control-row control-row--input" class:control-row--disabled={generationLockActive}>
  <span class="control-row-text">
    <span class="control-row-title">API Key</span>
  </span>
  <input
    class="text-input"
    type="text"
    bind:value={connectorApiKey}
    disabled={generationLockActive}
    onblur={commitConnector}
    onkeydown={(e) => {
      if (e.key === "Enter") (e.target as HTMLInputElement).blur()
    }}
  />
</label>

{#if $connector.type === "openrouter"}
  <label class="control-row control-row--input" class:control-row--disabled={generationLockActive}>
    <span class="control-row-text">
      <span class="control-row-title">Model ID</span>
      <span class="control-row-sub">Example: openrouter/free</span>
    </span>
    <input
      class="text-input text-input--mono"
      type="text"
      bind:value={openrouterModelDraft}
      disabled={generationLockActive}
      onblur={commitOpenRouterModel}
      onkeydown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
      }}
    />
  </label>

  <div class="control-row control-row--input control-row--stack" class:control-row--disabled={generationLockActive}>
    <span class="control-row-text">
      <span class="control-row-title">Search Models</span>
      <span class="control-row-sub">Queries /models via server proxy (cached)</span>
    </span>

    <div class="model-search">
      <input
        class="text-input"
        type="text"
        placeholder="Search model id…"
        bind:value={modelSearchQuery}
        disabled={generationLockActive}
        onkeydown={(e) => {
          if (e.key === "Enter") void searchModels()
        }}
      />
      <button class="preset-btn" disabled={modelSearchLoading || generationLockActive} onclick={searchModels}>
        {modelSearchLoading ? "Searching…" : "Search"}
      </button>
    </div>

    <div class="model-filters">
      <label class="filter-toggle">
        <input type="checkbox" bind:checked={modelSearchOnlyFree} disabled={generationLockActive} />
        <span>Free only</span>
      </label>
      <label class="filter-toggle">
        <input type="checkbox" bind:checked={modelSearchOnlyJsonSchema} disabled={generationLockActive} />
        <span>JSON Schema only</span>
      </label>
      {#if modelSearchResults.length > 0 && (modelSearchOnlyFree || modelSearchOnlyJsonSchema)}
        <div class="filter-summary">Showing {filteredModelSearchResults.length} / {modelSearchResults.length}</div>
      {/if}
    </div>

    <Select
      value={$connector.model}
      width="100%"
      placeholder={modelSearchResults.length ? "Select model…" : "No results yet"}
      options={modelSelectOptions}
      ariaLabel="OpenRouter model"
      disabled={generationLockActive}
      onChange={(v) => pickOpenRouterModel(String(v))}
    />

    {#if modelSearchError}
      <div class="conn-error">{modelSearchError}</div>
    {/if}
  </div>
{/if}

<div class="divider"></div>

<div class="control-section-label">Story Defaults</div>

<label class="control-row" class:control-row--disabled={generationLockActive}>
  <span class="control-row-text">
    <span class="control-row-title">Enable Author Note in prompts</span>
    <span class="control-row-sub">When disabled, author notes are not sent to the model (saved notes remain)</span>
  </span>
  <input type="checkbox" bind:checked={$authorNoteEnabled} disabled={generationLockActive} />
</label>

<label class="control-row control-row--input control-row--stack">
  <span class="control-row-text">
    <span class="control-row-title">Default Author Note</span>
    <span class="control-row-sub">Applied to newly created stories</span>
  </span>
  <textarea class="text-input" rows="3" bind:value={authorNoteDraft} onblur={commitAuthorNote}></textarea>
</label>

<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Author Note Depth</span>
    <span class="control-row-sub">How many recent turns from the bottom to inject</span>
  </span>
  <input
    class="num-input"
    type="number"
    min="0"
    max="100"
    step="1"
    bind:value={authorNoteDepthDraft}
    onblur={commitAuthorNote}
  />
</label>

<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Author Note Position</span>
    <span class="control-row-sub">Before scenario, in-chat, or after scenario</span>
  </span>
  <select class="text-input" bind:value={authorNotePositionDraft} onchange={commitAuthorNote} onblur={commitAuthorNote}>
    <option value={2}>Before scenario</option>
    <option value={1}>In chat</option>
    <option value={0}>After scenario</option>
  </select>
</label>

<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Author Note Interval</span>
    <span class="control-row-sub">Inject note text every Nth user message (0 disables)</span>
  </span>
  <input
    class="num-input"
    type="number"
    min="0"
    max="1000"
    step="1"
    bind:value={authorNoteIntervalDraft}
    onblur={commitAuthorNote}
  />
</label>

<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Author Note Role</span>
    <span class="control-row-sub">Role hint (for display/markup only)</span>
  </span>
  <select class="text-input" bind:value={authorNoteRoleDraft} onchange={commitAuthorNote} onblur={commitAuthorNote}>
    <option value={0}>System</option>
    <option value={1}>User</option>
    <option value={2}>Assistant</option>
  </select>
</label>

<label class="control-row" class:control-row--disabled={generationLockActive}>
  <span class="control-row-text">
    <span class="control-row-title">Default: Embed state blocks in Author Note</span>
    <span class="control-row-sub">If enabled, volatile state sections are wrapped into the author note</span>
  </span>
  <input
    type="checkbox"
    bind:checked={authorNoteEmbedStateDraft}
    disabled={generationLockActive}
    onchange={commitAuthorNote}
  />
</label>

<div class="divider"></div>

<div class="control-section-label">Sampler Preset</div>
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

<div class="divider"></div>

<style>
  .model-search {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .model-search .text-input {
    flex: 1;
    min-width: 0;
  }

  .model-filters {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .filter-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    color: var(--text);
    user-select: none;
    cursor: pointer;
  }
  .filter-toggle input {
    width: 1rem;
    height: 1rem;
    accent-color: var(--accent);
  }
  .filter-summary {
    margin-left: auto;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-dim);
  }

  .preset-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 520px) {
    .model-search {
      flex-direction: column;
      align-items: stretch;
    }
  }

  .conn-error {
    color: var(--danger);
    font-family: var(--font-ui);
    font-size: 0.85rem;
    line-height: 1.35;
  }

  .connector-badge {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-dim);
    padding: 0.25rem 0.6rem;
    letter-spacing: 0.03em;
  }

  .ctx-limit-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .ctx-refresh {
    padding: 0.3rem 0.6rem;
  }

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
  .preset-btn {
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 500;
    padding: 0.4rem 0.85rem;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s,
      background 0.15s;
  }
  .preset-btn:hover {
    color: var(--text);
    border-color: var(--border-hover);
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
