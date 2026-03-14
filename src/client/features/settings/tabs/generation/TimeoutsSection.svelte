<!--
  Aesthetic direction: Industrial / Utilitarian.
  Differentiator: "Instrument panel" timeouts with core controls always visible and advanced groups tucked into compact disclosure panels.
-->
<script lang="ts">
  import type { TimeoutSettings } from "../../../../api/client.js"
  import { DEFAULT_TIMEOUTS, timeouts } from "../../../../stores/settings.js"

  type Props = {
    disabled?: boolean
  }

  let { disabled = false }: Props = $props()

  type TimeoutKey = keyof TimeoutSettings
  type TimeoutUnit = "ms" | "sec" | "min"
  type TimeoutField = {
    key: TimeoutKey
    label: string
    sub: string
    unit: TimeoutUnit
    min: number
    max: number
    step: number
  }

  const UNIT: Record<TimeoutUnit, { mult: number; suffix: string }> = {
    ms: { mult: 1, suffix: "ms" },
    sec: { mult: 1000, suffix: "s" },
    min: { mult: 60_000, suffix: "min" },
  }

  const CORE_FIELDS: TimeoutField[] = [
    {
      key: "llmRequestMs",
      label: "LLM request timeout",
      sub: "How long the server waits for the model before aborting",
      unit: "sec",
      min: 1,
      max: 3600,
      step: 1,
    },
    {
      key: "upstreamFetchMs",
      label: "Upstream fetch timeout",
      sub: "Timeout for /models and ctx-limit detection fetches",
      unit: "sec",
      min: 1,
      max: 300,
      step: 1,
    },
    {
      key: "streamSessionTtlMs",
      label: "Stream session TTL",
      sub: "How long the server keeps a stream snapshot after last subscriber",
      unit: "sec",
      min: 1,
      max: 600,
      step: 1,
    },
  ]

  const UX_FIELDS: TimeoutField[] = [
    {
      key: "pendingRequestTtlMs",
      label: "Pending request TTL",
      sub: "How long the app will try to resume an interrupted generation",
      unit: "min",
      min: 1,
      max: 1440,
      step: 1,
    },
    {
      key: "uiErrorToastMs",
      label: "Error toast duration",
      sub: "Default duration for red error banners",
      unit: "ms",
      min: 0,
      max: 60_000,
      step: 100,
    },
    {
      key: "uiQuietNoticeMs",
      label: "Quiet notice duration",
      sub: "Default duration for gray status notices",
      unit: "ms",
      min: 0,
      max: 60_000,
      step: 100,
    },
    {
      key: "uiFlashMs",
      label: "UI flash duration",
      sub: "Highlight pulse for updated fields (character/NPC/scene)",
      unit: "ms",
      min: 0,
      max: 30_000,
      step: 50,
    },
    {
      key: "uiKeyboardScrollDelayMs",
      label: "Keyboard scroll delay",
      sub: "Delay before scrolling after virtual keyboard opens",
      unit: "ms",
      min: 0,
      max: 5000,
      step: 10,
    },
    {
      key: "uiResumePendingTurnDelayMs",
      label: "Resume delay",
      sub: "Delay before attempting to resume a pending generation",
      unit: "ms",
      min: 0,
      max: 30_000,
      step: 50,
    },
  ]

  const CACHE_FIELDS: TimeoutField[] = [
    {
      key: "modelsCacheTtlMs",
      label: "Models cache TTL",
      sub: "Server-side /models cache duration",
      unit: "min",
      min: 1,
      max: 60,
      step: 1,
    },
    {
      key: "supportedParamsCacheTtlMs",
      label: "Supported-params cache TTL",
      sub: "Server-side cache for OpenRouter supported parameters",
      unit: "min",
      min: 1,
      max: 60,
      step: 1,
    },
    {
      key: "ctxLimitCacheTtlMs",
      label: "Ctx-limit cache TTL",
      sub: "Server-side cache for detected context length",
      unit: "min",
      min: 1,
      max: 60,
      step: 1,
    },
    {
      key: "fieldWatchDebounceMs",
      label: "Field watcher debounce",
      sub: "Debounce for reloading schema/settings field-description JSON",
      unit: "ms",
      min: 0,
      max: 5000,
      step: 10,
    },
  ]

  const ALL_FIELDS = [...CORE_FIELDS, ...UX_FIELDS, ...CACHE_FIELDS] as const

  let drafts = $state({} as Record<TimeoutKey, string>)

  function fmt(field: TimeoutField): string {
    const { mult } = UNIT[field.unit]
    const raw = $timeouts[field.key]
    const display = mult === 1 ? raw : Math.round(raw / mult)
    return String(display)
  }

  $effect(() => {
    for (const field of ALL_FIELDS) drafts[field.key] = fmt(field)
  })

  function parseIntDraft(value: string): number | null {
    const trimmed = value.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    if (!Number.isFinite(n)) return null
    return Math.trunc(n)
  }

  function clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.trunc(value)))
  }

  function blurOnEnter(e: KeyboardEvent) {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur()
  }

  function commitField(field: TimeoutField) {
    const parsed = parseIntDraft(drafts[field.key])
    if (parsed === null) {
      drafts[field.key] = fmt(field)
      return
    }
    const clamped = clampInt(parsed, field.min, field.max)
    const { mult } = UNIT[field.unit]
    const nextMs = clamped * mult
    if (nextMs === $timeouts[field.key]) {
      drafts[field.key] = fmt(field)
      return
    }
    timeouts.set({ ...$timeouts, [field.key]: nextMs } as TimeoutSettings)
  }

  function resetAll() {
    if (disabled) return
    timeouts.set({ ...DEFAULT_TIMEOUTS })
  }

  function preventToggleIfDisabled(e: Event) {
    if (!disabled) return
    e.preventDefault()
    e.stopPropagation()
  }

  const warnings = $derived.by(() => {
    const items: string[] = []
    if ($timeouts.llmRequestMs < 30_000) items.push("LLM timeout is very low; long generations may abort.")
    if ($timeouts.upstreamFetchMs < 2000) items.push("Upstream timeout is very low; model search may fail.")
    if ($timeouts.streamSessionTtlMs < 10_000)
      items.push("Stream TTL is very low; streaming resumes may miss snapshots.")
    return items
  })

  const summaryChips = $derived.by(() => [
    { label: "LLM", value: `${Math.round($timeouts.llmRequestMs / 1000)}s` },
    { label: "Upstream", value: `${Math.round($timeouts.upstreamFetchMs / 1000)}s` },
    { label: "Stream TTL", value: `${Math.round($timeouts.streamSessionTtlMs / 1000)}s` },
  ])
</script>

<div class="control-section-label timeouts-head">
  <span>Timeouts</span>
  <div class="timeouts-actions">
    <div class="timeouts-chips" aria-label="Timeout summary">
      {#each summaryChips as chip (chip.label)}
        <span class="timeouts-chip" title={chip.label}>
          <span class="timeouts-chip-k">{chip.label}</span>
          <span class="timeouts-chip-v">{chip.value}</span>
        </span>
      {/each}
    </div>
    <button type="button" class="btn-ghost small" {disabled} onclick={resetAll} title="Reset all timeouts">
      Reset
    </button>
  </div>
</div>

{#if warnings.length > 0}
  <div class="timeouts-warning" role="note">
    <div class="timeouts-warning-title">Heads up</div>
    <ul class="timeouts-warning-body">
      {#each warnings as warning (warning)}
        <li>{warning}</li>
      {/each}
    </ul>
  </div>
{/if}

{#each CORE_FIELDS as field (field.key)}
  <label class="control-row control-row--input" class:control-row--disabled={disabled}>
    <span class="control-row-text">
      <span class="control-row-title">{field.label} ({UNIT[field.unit].suffix})</span>
      <span class="control-row-sub">{field.sub}</span>
    </span>
    <input
      class="num-input"
      type="number"
      min={field.min}
      max={field.max}
      step={field.step}
      bind:value={drafts[field.key]}
      {disabled}
      onblur={() => commitField(field)}
      onkeydown={blurOnEnter}
    />
  </label>
{/each}

<details class="timeouts-details" data-disabled={disabled ? "true" : "false"}>
  <summary
    class="timeouts-summary"
    aria-disabled={disabled}
    tabindex={disabled ? -1 : 0}
    onclick={preventToggleIfDisabled}
  >
    UI & Resume
  </summary>
  {#each UX_FIELDS as field (field.key)}
    <label class="control-row control-row--input" class:control-row--disabled={disabled}>
      <span class="control-row-text">
        <span class="control-row-title">{field.label} ({UNIT[field.unit].suffix})</span>
        <span class="control-row-sub">{field.sub}</span>
      </span>
      <input
        class="num-input"
        type="number"
        min={field.min}
        max={field.max}
        step={field.step}
        bind:value={drafts[field.key]}
        {disabled}
        onblur={() => commitField(field)}
        onkeydown={blurOnEnter}
      />
    </label>
  {/each}
</details>

<details class="timeouts-details" data-disabled={disabled ? "true" : "false"}>
  <summary
    class="timeouts-summary"
    aria-disabled={disabled}
    tabindex={disabled ? -1 : 0}
    onclick={preventToggleIfDisabled}
  >
    Caches & Watchers
  </summary>
  {#each CACHE_FIELDS as field (field.key)}
    <label class="control-row control-row--input" class:control-row--disabled={disabled}>
      <span class="control-row-text">
        <span class="control-row-title">{field.label} ({UNIT[field.unit].suffix})</span>
        <span class="control-row-sub">{field.sub}</span>
      </span>
      <input
        class="num-input"
        type="number"
        min={field.min}
        max={field.max}
        step={field.step}
        bind:value={drafts[field.key]}
        {disabled}
        onblur={() => commitField(field)}
        onkeydown={blurOnEnter}
      />
    </label>
  {/each}
</details>

<style>
  .timeouts-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .timeouts-actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .timeouts-chips {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .timeouts-chip {
    display: inline-flex;
    align-items: baseline;
    gap: 0.35rem;
    padding: 0.22rem 0.5rem;
    border: 1px solid var(--border);
    background: var(--bg-input);
    border-radius: 999px;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    color: var(--text-dim);
    line-height: 1;
    user-select: none;
    white-space: nowrap;
  }
  .timeouts-chip-k {
    letter-spacing: 0.03em;
    text-transform: uppercase;
    opacity: 0.9;
  }
  .timeouts-chip-v {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    color: var(--text);
  }

  .timeouts-warning {
    margin: 0.55rem 1rem 0.2rem;
    padding: 0.65rem 0.85rem;
    border: 1px solid var(--warning-border, rgba(194, 122, 26, 0.22));
    background: var(--warning-bg, rgba(194, 122, 26, 0.08));
    border-radius: 8px;
  }
  .timeouts-warning-title {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 0.2rem;
  }
  .timeouts-warning-body {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--text-dim);
    line-height: 1.4;
    margin: 0;
    padding-left: 1.05rem;
  }

  .timeouts-details {
    margin: 0.35rem 1rem 0;
    border: 1px solid var(--border);
    background: var(--bg-input);
    background: color-mix(in srgb, var(--bg-input) 65%, transparent);
    border-radius: 10px;
    overflow: hidden;
  }
  .timeouts-summary {
    list-style: none;
    cursor: pointer;
    padding: 0.6rem 0.75rem;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 0.02em;
  }
  .timeouts-summary::-webkit-details-marker {
    display: none;
  }
  .timeouts-details > .timeouts-summary::after {
    content: "▾";
    float: right;
    color: var(--text-dim);
    transition: transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .timeouts-details[open] > .timeouts-summary::after {
    transform: rotate(-180deg);
  }
  .timeouts-details[data-disabled="true"] {
    opacity: 0.7;
  }
  .timeouts-details[data-disabled="true"] .timeouts-summary {
    cursor: not-allowed;
  }

  .timeouts-details :global(.control-row) {
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }
  .timeouts-details :global(.control-row:first-of-type) {
    border-top: 1px solid var(--border);
  }

  @media (max-width: 520px) {
    .timeouts-actions {
      align-items: flex-end;
      flex-direction: column;
      gap: 0.45rem;
    }
    .timeouts-chips {
      justify-content: flex-end;
    }
  }
</style>
