<!--
  Aesthetic direction: Industrial / Utilitarian.
  Differentiator: "Instrument panel" timeouts with core controls always visible and advanced groups tucked into compact disclosure panels.
-->
<script lang="ts">
  import type { TimeoutSettings } from "@/shared/api-types"
  import { DEFAULT_TIMEOUTS, timeouts } from "@/stores/settings"
  import { cn } from "@/utils.js"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Input } from "@/components/ui/input"

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

<div class="pt-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeouts</div>
    <div class="flex items-center gap-2">
      <div class="flex flex-wrap gap-2" aria-label="Timeout summary">
        {#each summaryChips as chip (chip.label)}
          <span
            class="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
            title={chip.label}
          >
            <span class="text-foreground/80">{chip.label}</span>
            <span class="tabular-nums">{chip.value}</span>
          </span>
        {/each}
      </div>
      <Button size="sm" variant="outline" {disabled} onclick={resetAll} title="Reset all timeouts">Reset</Button>
    </div>
  </div>
</div>

{#if warnings.length > 0}
  <div
    class="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300"
    role="note"
  >
    <div class="font-medium text-foreground">Heads up</div>
    <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      {#each warnings as warning (warning)}
        <li>{warning}</li>
      {/each}
    </ul>
  </div>
{/if}

{#snippet Row(field)}
  <div class={cn("flex items-start justify-between gap-4 border-b py-3", disabled && "opacity-60")}>
    <div class="min-w-0 flex-1 space-y-1">
      <div class="text-sm font-medium text-foreground">{field.label} ({UNIT[field.unit].suffix})</div>
      <div class="text-xs text-muted-foreground">{field.sub}</div>
    </div>
    <div class="w-28">
      <Input
        type="number"
        min={field.min}
        max={field.max}
        step={field.step}
        bind:value={drafts[field.key]}
        {disabled}
        onblur={() => commitField(field)}
        onkeydown={blurOnEnter}
      />
    </div>
  </div>
{/snippet}

{#each CORE_FIELDS as field (field.key)}
  {@render Row(field)}
{/each}

<details class="mt-4 rounded-lg border bg-card">
  <summary
    aria-disabled={disabled}
    tabindex={disabled ? -1 : 0}
    onclick={preventToggleIfDisabled}
    class={cn(
      "flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent",
      disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
    )}
  >
    <span>UI &amp; Resume</span>
    <Badge variant="outline" class="font-mono text-[11px] text-muted-foreground">Advanced</Badge>
  </summary>
  <div class="px-4 pb-2">
    {#each UX_FIELDS as field (field.key)}
      {@render Row(field)}
    {/each}
  </div>
</details>

<details class="mt-3 rounded-lg border bg-card">
  <summary
    aria-disabled={disabled}
    tabindex={disabled ? -1 : 0}
    onclick={preventToggleIfDisabled}
    class={cn(
      "flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent",
      disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
    )}
  >
    <span>Caches &amp; Watchers</span>
    <Badge variant="outline" class="font-mono text-[11px] text-muted-foreground">Advanced</Badge>
  </summary>
  <div class="px-4 pb-2">
    {#each CACHE_FIELDS as field (field.key)}
      {@render Row(field)}
    {/each}
  </div>
</details>
