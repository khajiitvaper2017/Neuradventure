<script lang="ts">
  import type { GenerationParams, LLMConnector, ModelInfo } from "@/shared/api-types"
  import { HIDDEN_SECRET_PLACEHOLDER } from "@/shared/secrets"
  import { settings as settingsService } from "@/services/settings"
  import * as Select from "@/components/ui/select"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Checkbox } from "@/components/ui/checkbox"
  import { Input } from "@/components/ui/input"
  import { Switch } from "@/components/ui/switch"
  import { cn } from "@/utils.js"
  import { isChatGenerating } from "@/stores/chat"
  import { isGenerating } from "@/stores/game"
  import { connector, ctxLimitDetected, generation, streamingEnabled } from "@/stores/settings"
  import { repetitionParams, samplingParams } from "@/features/settings/lib/generationParamDefs"
  import { getOpenRouterParamStatus } from "@/features/settings/lib/openrouterParams"
  import { buildModelSelectOptions, filterModelResults } from "@/features/settings/lib/openrouterModels"
  import { TriangleAlert } from "@lucide/svelte"

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
  let connectorTypeLabel = $derived(connectorTypeOptions.find((o) => o.value === $connector.type)?.label ?? "Select…")

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
  let modelSearchSelectPlaceholder = $derived(modelSearchResults.length ? "Select model…" : "No results yet")

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
  <div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm" role="note">
    <div class="flex items-start gap-3">
      <TriangleAlert class="mt-0.5 size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div>
        <div class="font-medium text-foreground">Unsupported parameters</div>
        <div class="mt-1 text-sm text-muted-foreground">
          <span class="font-mono text-foreground/90">{$connector.type === "openrouter" ? $connector.model : ""}</span>
          does not support: {unsupportedParamLabels.join(", ")}. These parameters will be ignored.
        </div>
      </div>
    </div>
  </div>
{/if}

<div class="pt-4">
  <div class="flex items-center justify-between gap-3">
    <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Connection</div>
    {#if generationLockActive}
      <Badge
        variant="secondary"
        class="font-mono text-[11px]"
        title="A generation is in progress; connection controls are locked until it completes"
      >
        Generating…
      </Badge>
    {/if}
  </div>
</div>

<div class={cn("flex items-start justify-between gap-4 border-b py-3", generationLockActive && "opacity-60")}>
  <div class="min-w-0 flex-1 space-y-1">
    <div class="text-sm font-medium text-foreground">Backend</div>
    <div class="text-xs text-muted-foreground">Provider for the OpenAI-compatible API endpoint</div>
  </div>
  <Select.Root
    type="single"
    value={$connector.type}
    items={connectorTypeOptions}
    disabled={generationLockActive}
    onValueChange={(next) => setConnectorType(next as LLMConnector["type"])}
  >
    <Select.Trigger class="w-[12rem]" aria-label="Backend">
      {connectorTypeLabel}
    </Select.Trigger>
    <Select.Content>
      {#each connectorTypeOptions as option (option.value)}
        <Select.Item {...option} />
      {/each}
    </Select.Content>
  </Select.Root>
</div>

<div class={cn("flex items-start justify-between gap-4 border-b py-3", generationLockActive && "opacity-60")}>
  <div class="min-w-0 flex-1 space-y-1">
    <div class="text-sm font-medium text-foreground">Ctx Limit (Detected)</div>
    <div class="text-xs text-muted-foreground">Fetched from the current provider (cached)</div>
  </div>
  <div class="flex items-center gap-2">
    <Badge variant="outline" class="font-mono text-[11px] tabular-nums">
      {$ctxLimitDetected > 0 ? $ctxLimitDetected : "Unknown"}
    </Badge>
    <Button
      variant="outline"
      size="sm"
      disabled={ctxRefreshLoading || generationLockActive}
      onclick={refreshCtxLimitDetected}
    >
      {ctxRefreshLoading ? "Refreshing…" : "Refresh"}
    </Button>
  </div>
</div>

<div class={cn("flex items-start justify-between gap-4 border-b py-3", generationLockActive && "opacity-60")}>
  <div class="min-w-0 flex-1 space-y-1">
    <div class="text-sm font-medium text-foreground">Ctx Limit (Override)</div>
    <div class="text-xs text-muted-foreground">
      0 = auto-detect{#if $ctxLimitDetected > 0}
        (currently: {$ctxLimitDetected}){/if}
    </div>
  </div>
  <div class="w-28">
    <Input
      type="number"
      value={$generation.ctx_limit}
      min="0"
      max="32768"
      step="1"
      disabled={generationLockActive}
      onchange={(e) => handleNumInput("ctx_limit", e, true)}
    />
  </div>
</div>

<div class={cn("flex items-start justify-between gap-4 border-b py-3", generationLockActive && "opacity-60")}>
  <div class="min-w-0 flex-1 space-y-1">
    <div class="text-sm font-medium text-foreground">Use streaming</div>
    <div class="text-xs text-muted-foreground">
      Stream model output while generating (enables partial output via WebSocket)
    </div>
  </div>
  <Switch
    checked={$streamingEnabled}
    disabled={generationLockActive}
    onCheckedChange={(v) => streamingEnabled.set(v)}
  />
</div>

<div class={cn("flex items-start justify-between gap-4 border-b py-3", generationLockActive && "opacity-60")}>
  <div class="min-w-0 flex-1 space-y-1">
    <div class="text-sm font-medium text-foreground">API URL</div>
  </div>
  <div class="w-[min(62%,22rem)]">
    <Input
      type="text"
      bind:value={connectorUrl}
      disabled={generationLockActive}
      onblur={commitConnector}
      onkeydown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
      }}
    />
  </div>
</div>

<div class={cn("flex items-start justify-between gap-4 border-b py-3", generationLockActive && "opacity-60")}>
  <div class="min-w-0 flex-1 space-y-1">
    <div class="text-sm font-medium text-foreground">API Key</div>
    <div class="text-xs text-muted-foreground">Stored locally. Never synced.</div>
  </div>
  <div class="flex min-w-0 items-center gap-2">
    <Input
      class="min-w-0 flex-1"
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
    <Button
      variant="outline"
      size="sm"
      disabled={generationLockActive}
      onclick={() => {
        showApiKey = !showApiKey
      }}
      title={showApiKey ? "Hide API key" : "Show API key"}
    >
      {showApiKey ? "Hide" : "Show"}
    </Button>
    <Button
      variant="outline"
      size="sm"
      disabled={generationLockActive}
      onclick={() => {
        connectorApiKey = ""
        commitConnector()
      }}
      title="Clear API key"
    >
      Clear
    </Button>
  </div>
</div>

{#if $connector.type === "openrouter"}
  <div class={cn("flex items-start justify-between gap-4 border-b py-3", generationLockActive && "opacity-60")}>
    <div class="min-w-0 flex-1 space-y-1">
      <div class="text-sm font-medium text-foreground">Model ID</div>
      <div class="text-xs text-muted-foreground">Example: openrouter/free</div>
    </div>
    <div class="w-[min(62%,22rem)]">
      <Input
        class="font-mono"
        type="text"
        bind:value={openrouterModelDraft}
        disabled={generationLockActive}
        onblur={commitOpenRouterModel}
        onkeydown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        }}
      />
    </div>
  </div>

  <div class={cn("mt-4 rounded-lg border bg-card p-4", generationLockActive && "opacity-60")}>
    <div class="text-sm font-medium text-foreground">Search Models</div>
    <div class="mt-0.5 text-xs text-muted-foreground">Queries /models via server proxy (cached)</div>

    <div class="mt-3 flex items-center gap-2 max-[520px]:flex-col max-[520px]:items-stretch">
      <Input
        type="text"
        placeholder="Search model id…"
        bind:value={modelSearchQuery}
        disabled={generationLockActive}
        onkeydown={(e) => {
          if (e.key === "Enter") void searchModels()
        }}
      />
      <Button variant="outline" disabled={modelSearchLoading || generationLockActive} onclick={searchModels}>
        {modelSearchLoading ? "Searching…" : "Search"}
      </Button>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-4">
      <div
        class={cn(
          "inline-flex items-center gap-2 text-sm text-foreground",
          generationLockActive && "pointer-events-none",
        )}
      >
        <Checkbox bind:checked={modelSearchOnlyFree} disabled={generationLockActive} />
        <span>Free only</span>
      </div>
      <div
        class={cn(
          "inline-flex items-center gap-2 text-sm text-foreground",
          generationLockActive && "pointer-events-none",
        )}
      >
        <Checkbox bind:checked={modelSearchOnlyJsonSchema} disabled={generationLockActive} />
        <span>JSON Schema only</span>
      </div>
      {#if modelSearchResults.length > 0 && (modelSearchOnlyFree || modelSearchOnlyJsonSchema)}
        <div class="ml-auto text-xs text-muted-foreground">
          Showing {filteredModelSearchResults.length} / {modelSearchResults.length}
        </div>
      {/if}
    </div>

    <div class="mt-3">
      <Select.Root
        type="single"
        value={$connector.model}
        items={modelSelectOptions}
        disabled={generationLockActive}
        onValueChange={(v) => pickOpenRouterModel(v)}
      >
        <Select.Trigger
          class="w-full"
          aria-label="OpenRouter model"
          data-placeholder={!$connector.model?.trim() ? true : undefined}
        >
          {modelSelectOptions.find((o) => o.value === $connector.model)?.label ??
            ($connector.model || modelSearchSelectPlaceholder)}
        </Select.Trigger>
        <Select.Content>
          {#each modelSelectOptions as option (option.value)}
            <Select.Item {...option} />
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    {#if modelSearchError}
      <div class="mt-2 text-sm text-destructive">{modelSearchError}</div>
    {/if}
  </div>
{/if}

<div class="h-10"></div>
