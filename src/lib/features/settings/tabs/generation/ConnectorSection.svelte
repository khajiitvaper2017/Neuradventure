<script lang="ts">
  import type { GenerationParams, LLMConnector, ModelInfo } from "@/shared/api-types"
  import { HIDDEN_SECRET_PLACEHOLDER } from "@/shared/secrets"
  import { settings as settingsService } from "@/services/settings"
  import Select from "@/components/controls/Select.svelte"
  import { isChatGenerating } from "@/stores/chat"
  import { isGenerating } from "@/stores/game"
  import { connector, ctxLimitDetected, generation, streamingEnabled } from "@/stores/settings"
  import { repetitionParams, samplingParams } from "@/features/settings/lib/generationParamDefs"
  import { getOpenRouterParamStatus } from "@/features/settings/lib/openrouterParams"
  import { buildModelSelectOptions, filterModelResults } from "@/features/settings/lib/openrouterModels"

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

  let connectorUrl = $state($connector.url)
  let connectorApiKey = $state($connector.api_keys[$connector.type])
  let showApiKey = $state(false)
  let openrouterModelDraft = $state($connector.type === "openrouter" ? $connector.model : OPENROUTER_DEFAULT_MODEL)
  let modelSearchQuery = $state("")
  let modelSearchLoading = $state(false)
  let modelSearchError = $state<string | null>(null)
  let modelSearchOnlyFree = $state(false)
  let modelSearchOnlyJsonSchema = $state(false)

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

  function commitConnector() {
    const trimmedUrl = connectorUrl.trim()
    const trimmedKey = connectorApiKey.trim()
    if (!trimmedUrl) return

    if ($connector.type === "openrouter") {
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
          koboldcpp: $connector.api_keys.koboldcpp.trim(),
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
        koboldcpp: $connector.api_keys.koboldcpp.trim(),
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

  function setGen<K extends keyof GenerationParams>(key: K, value: GenerationParams[K]) {
    generation.set({ ...$generation, [key]: value })
  }

  function handleNumInput(key: keyof GenerationParams, e: Event, isInt = false) {
    const input = e.target as HTMLInputElement
    const raw = input.value.trim()
    if (raw === "" || raw === "-") return
    const val = isInt ? parseInt(raw, 10) : parseFloat(raw)
    if (!isNaN(val)) setGen(key, val)
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

<label class="control-row control-row--input" class:control-row--disabled={generationLockActive}>
  <span class="control-row-text">
    <span class="control-row-title">Ctx Limit (Override)</span>
    <span class="control-row-sub">
      0 = auto-detect{#if $ctxLimitDetected > 0}
        (currently: {$ctxLimitDetected}){/if}
    </span>
  </span>
  <input
    class="num-input"
    type="number"
    value={$generation.ctx_limit}
    min="0"
    max="32768"
    step="1"
    disabled={generationLockActive}
    onchange={(e) => handleNumInput("ctx_limit", e, true)}
  />
</label>

<label class="control-row" class:control-row--disabled={generationLockActive}>
  <span class="control-row-text">
    <span class="control-row-title">Use streaming</span>
    <span class="control-row-sub">Stream model output while generating (enables partial output via WebSocket)</span>
  </span>
  <input type="checkbox" bind:checked={$streamingEnabled} disabled={generationLockActive} />
</label>

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
  <div class="api-key-wrap">
    <input
      class="text-input"
      type={showApiKey ? "text" : "password"}
      bind:value={connectorApiKey}
      placeholder={$connector.api_keys[$connector.type] === HIDDEN_SECRET_PLACEHOLDER ? "Stored (hidden)" : ""}
      autocomplete="new-password"
      spellcheck="false"
      disabled={generationLockActive}
      onblur={commitConnector}
      onkeydown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
      }}
    />
    <button
      class="preset-btn api-key-btn"
      type="button"
      disabled={generationLockActive}
      onclick={() => {
        showApiKey = !showApiKey
      }}
      title={showApiKey ? "Hide API key" : "Show API key"}
    >
      {showApiKey ? "Hide" : "Show"}
    </button>
    <button
      class="preset-btn api-key-btn"
      type="button"
      disabled={generationLockActive}
      onclick={() => {
        connectorApiKey = ""
        commitConnector()
      }}
      title="Clear API key"
    >
      Clear
    </button>
  </div>
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

<div class="settings-bottom-pad"></div>

<style>
  .api-key-wrap {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-width: 0;
  }

  .api-key-wrap .text-input {
    flex: 1;
    min-width: 0;
  }

  .api-key-btn {
    padding: 0.3rem 0.6rem;
    white-space: nowrap;
  }

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
</style>
