<script lang="ts">
  import type { GenerationParams, ModelInfo } from "@/types/api"
  import { connector, generation } from "@/stores/settings"
  import { cn } from "@/utils.js"
  import { formatSamplerOrder, parseSamplerOrder } from "@/features/settings/lib/samplerOrder"
  import { keyMeta } from "@/features/settings/tabs/generation/openRouterParamSupport"
  import { Badge } from "@/components/ui/badge"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import { Input } from "@/components/ui/input"
  import { Separator } from "@/components/ui/separator"
  import { Switch } from "@/components/ui/switch"
  import { Textarea } from "@/components/ui/textarea"
  import { FileSliders } from "@lucide/svelte"

  type Props = {
    modelSearchResults?: ModelInfo[]
  }

  let { modelSearchResults = [] }: Props = $props()

  let samplerOrderDraft = $derived(formatSamplerOrder($generation.sampler_order))
  let dryBreakersDraft = $derived(JSON.stringify($generation.dry_sequence_breakers, null, 2))
  let bannedTokensDraft = $derived($generation.banned_tokens.join("\n"))
  let logitBiasDraft = $derived(JSON.stringify($generation.logit_bias, null, 2))

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

  const isIgnored = (meta: { status?: string }) => meta.status === "unsupported" || meta.status === "not_sent"

  let eosMeta = $derived.by(() => keyMeta("ban_eos_token", $connector, modelSearchResults))
  let renderMeta = $derived.by(() => keyMeta("render_special", $connector, modelSearchResults))
  let orderMeta = $derived.by(() => keyMeta("sampler_order", $connector, modelSearchResults))
  let smoothingFactorMeta = $derived.by(() => keyMeta("smoothing_factor", $connector, modelSearchResults))
  let smoothingCurveMeta = $derived.by(() => keyMeta("smoothing_curve", $connector, modelSearchResults))
  let adaptiveTargetMeta = $derived.by(() => keyMeta("adaptive_target", $connector, modelSearchResults))
  let adaptiveDecayMeta = $derived.by(() => keyMeta("adaptive_decay", $connector, modelSearchResults))
  let bannedTokensMeta = $derived.by(() => keyMeta("banned_tokens", $connector, modelSearchResults))
  let logitBiasMeta = $derived.by(() => keyMeta("logit_bias", $connector, modelSearchResults))
  let dryBreakersMeta = $derived.by(() => keyMeta("dry_sequence_breakers", $connector, modelSearchResults))
  let eosIgnored = $derived.by(() => isIgnored(eosMeta))
  let renderIgnored = $derived.by(() => isIgnored(renderMeta))
  let orderIgnored = $derived.by(() => isIgnored(orderMeta))
  let smoothingFactorIgnored = $derived.by(() => isIgnored(smoothingFactorMeta))
  let smoothingCurveIgnored = $derived.by(() => isIgnored(smoothingCurveMeta))
  let adaptiveTargetIgnored = $derived.by(() => isIgnored(adaptiveTargetMeta))
  let adaptiveDecayIgnored = $derived.by(() => isIgnored(adaptiveDecayMeta))
  let bannedTokensIgnored = $derived.by(() => isIgnored(bannedTokensMeta))
  let logitBiasIgnored = $derived.by(() => isIgnored(logitBiasMeta))
  let dryBreakersIgnored = $derived.by(() => isIgnored(dryBreakersMeta))

  const isKoboldOnly = (meta: { status?: string }) => $connector.type === "openrouter" && meta.status === "not_sent"

  let eosKoboldOnly = $derived.by(() => isKoboldOnly(eosMeta))
  let renderKoboldOnly = $derived.by(() => isKoboldOnly(renderMeta))
  let orderKoboldOnly = $derived.by(() => isKoboldOnly(orderMeta))
  let smoothingFactorKoboldOnly = $derived.by(() => isKoboldOnly(smoothingFactorMeta))
  let smoothingCurveKoboldOnly = $derived.by(() => isKoboldOnly(smoothingCurveMeta))
  let adaptiveTargetKoboldOnly = $derived.by(() => isKoboldOnly(adaptiveTargetMeta))
  let adaptiveDecayKoboldOnly = $derived.by(() => isKoboldOnly(adaptiveDecayMeta))
  let bannedTokensKoboldOnly = $derived.by(() => isKoboldOnly(bannedTokensMeta))
  let logitBiasKoboldOnly = $derived.by(() => isKoboldOnly(logitBiasMeta))
  let dryBreakersKoboldOnly = $derived.by(() => isKoboldOnly(dryBreakersMeta))

  let showTopMain = $derived(!eosKoboldOnly || !renderKoboldOnly || !orderKoboldOnly)
  let showSmoothMain = $derived(!smoothingFactorKoboldOnly || !smoothingCurveKoboldOnly)
  let showAdaptiveMain = $derived(!adaptiveTargetKoboldOnly || !adaptiveDecayKoboldOnly)
  let showBansMain = $derived(!bannedTokensKoboldOnly || !logitBiasKoboldOnly || !dryBreakersKoboldOnly)

  let showSmoothKoboldOnly = $derived(smoothingFactorKoboldOnly || smoothingCurveKoboldOnly)
  let showAdaptiveKoboldOnly = $derived(adaptiveTargetKoboldOnly || adaptiveDecayKoboldOnly)
  let showBansKoboldOnly = $derived(bannedTokensKoboldOnly || logitBiasKoboldOnly || dryBreakersKoboldOnly)

  let hasKoboldOnly = $derived(
    eosKoboldOnly ||
      renderKoboldOnly ||
      orderKoboldOnly ||
      smoothingFactorKoboldOnly ||
      smoothingCurveKoboldOnly ||
      adaptiveTargetKoboldOnly ||
      adaptiveDecayKoboldOnly ||
      bannedTokensKoboldOnly ||
      logitBiasKoboldOnly ||
      dryBreakersKoboldOnly,
  )

  function commitSamplerOrder() {
    const parsed = parseSamplerOrder(samplerOrderDraft)
    if (!parsed) {
      samplerOrderDraft = formatSamplerOrder($generation.sampler_order)
      return
    }
    if (JSON.stringify(parsed) !== JSON.stringify($generation.sampler_order)) {
      setGen("sampler_order", parsed)
    }
  }

  function commitDryBreakers() {
    const trimmed = dryBreakersDraft.trim()
    if (!trimmed) {
      setGen("dry_sequence_breakers", [])
      return
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) throw new Error("Invalid array")
      setGen("dry_sequence_breakers", parsed)
    } catch {
      dryBreakersDraft = JSON.stringify($generation.dry_sequence_breakers, null, 2)
    }
  }

  function commitBannedTokens() {
    const list = bannedTokensDraft
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    setGen("banned_tokens", list)
  }

  function commitLogitBias() {
    const trimmed = logitBiasDraft.trim()
    if (!trimmed) {
      setGen("logit_bias", {})
      return
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid object")
      const obj = parsed as Record<string, unknown>
      const out: Record<string, number> = {}
      for (const [k, v] of Object.entries(obj)) {
        const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN
        if (!Number.isFinite(n)) continue
        out[k] = n
      }
      setGen("logit_bias", out)
    } catch {
      logitBiasDraft = JSON.stringify($generation.logit_bias, null, 2)
    }
  }
</script>

{#snippet banEosRow()}
  <div class={cn("flex items-start justify-between gap-4 border-b py-3", eosIgnored && "opacity-60")}>
    <div class="min-w-0 flex-1 space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <div class="text-sm font-medium text-foreground">Ban EOS Token</div>
        {#if eosMeta.badge}
          <Badge
            variant="outline"
            class={cn(
              "font-mono text-[11px]",
              eosMeta.badge.kind === "warning" &&
                "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
            title={eosMeta.title}
          >
            {eosMeta.badge.label}
          </Badge>
        {/if}
      </div>
      <div class="text-xs text-muted-foreground">Prevent the model from ending early</div>
    </div>
    <Switch checked={$generation.ban_eos_token} onCheckedChange={(v) => setGen("ban_eos_token", v)} />
  </div>
{/snippet}

{#snippet renderSpecialRow()}
  <div class={cn("flex items-start justify-between gap-4 border-b py-3", renderIgnored && "opacity-60")}>
    <div class="min-w-0 flex-1 space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <div class="text-sm font-medium text-foreground">Render Special Tokens</div>
        {#if renderMeta.badge}
          <Badge
            variant="outline"
            class={cn(
              "font-mono text-[11px]",
              renderMeta.badge.kind === "warning" &&
                "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
            title={renderMeta.title}
          >
            {renderMeta.badge.label}
          </Badge>
        {/if}
      </div>
      <div class="text-xs text-muted-foreground">Show special tokens in output (debug)</div>
    </div>
    <Switch checked={$generation.render_special} onCheckedChange={(v) => setGen("render_special", v)} />
  </div>
{/snippet}

{#snippet samplerOrderRow()}
  <div class={cn("flex items-start justify-between gap-4 border-b py-3", orderIgnored && "opacity-60")}>
    <div class="min-w-0 flex-1 space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <div class="text-sm font-medium text-foreground">Sampler Order</div>
        {#if orderMeta.badge}
          <Badge
            variant="outline"
            class={cn(
              "font-mono text-[11px]",
              orderMeta.badge.kind === "warning" &&
                "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
            title={orderMeta.title}
          >
            {orderMeta.badge.label}
          </Badge>
        {/if}
      </div>
      <div class="text-xs text-muted-foreground">Comma-separated list (Kobold default: 6,0,1,3,4,2,5)</div>
    </div>
    <div class="w-[min(55%,18rem)]">
      <Input
        class={cn(orderIgnored && "line-through decoration-muted-foreground")}
        type="text"
        bind:value={samplerOrderDraft}
        onblur={commitSamplerOrder}
        onkeydown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        }}
      />
    </div>
  </div>
{/snippet}

{#snippet smoothingFactorRow()}
  <div class={cn("flex items-start justify-between gap-4 border-b py-3", smoothingFactorIgnored && "opacity-60")}>
    <div class="min-w-0 flex-1 space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <div class="text-sm font-medium text-foreground">Smoothing Factor</div>
        {#if smoothingFactorMeta.badge}
          <Badge
            variant="outline"
            class={cn(
              "font-mono text-[11px]",
              smoothingFactorMeta.badge.kind === "warning" &&
                "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
            title={smoothingFactorMeta.title}
          >
            {smoothingFactorMeta.badge.label}
          </Badge>
        {/if}
      </div>
      <div class="text-xs text-muted-foreground">0 = off</div>
    </div>
    <div class="w-28">
      <Input
        class={cn(smoothingFactorIgnored && "line-through decoration-muted-foreground")}
        type="number"
        value={$generation.smoothing_factor}
        min="0"
        max="1"
        step="0.01"
        onchange={(e) => handleNumInput("smoothing_factor", e)}
      />
    </div>
  </div>
{/snippet}

{#snippet smoothingCurveRow()}
  <div class={cn("flex items-start justify-between gap-4 border-b py-3", smoothingCurveIgnored && "opacity-60")}>
    <div class="min-w-0 flex-1 space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <div class="text-sm font-medium text-foreground">Smoothing Curve</div>
        {#if smoothingCurveMeta.badge}
          <Badge
            variant="outline"
            class={cn(
              "font-mono text-[11px]",
              smoothingCurveMeta.badge.kind === "warning" &&
                "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
            title={smoothingCurveMeta.title}
          >
            {smoothingCurveMeta.badge.label}
          </Badge>
        {/if}
      </div>
      <div class="text-xs text-muted-foreground">Curve shaping for smoothing</div>
    </div>
    <div class="w-28">
      <Input
        class={cn(smoothingCurveIgnored && "line-through decoration-muted-foreground")}
        type="number"
        value={$generation.smoothing_curve}
        min="0.1"
        max="5"
        step="0.1"
        onchange={(e) => handleNumInput("smoothing_curve", e)}
      />
    </div>
  </div>
{/snippet}

{#snippet adaptiveTargetRow()}
  <div class={cn("flex items-start justify-between gap-4 border-b py-3", adaptiveTargetIgnored && "opacity-60")}>
    <div class="min-w-0 flex-1 space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <div class="text-sm font-medium text-foreground">Adaptive Target</div>
        {#if adaptiveTargetMeta.badge}
          <Badge
            variant="outline"
            class={cn(
              "font-mono text-[11px]",
              adaptiveTargetMeta.badge.kind === "warning" &&
                "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
            title={adaptiveTargetMeta.title}
          >
            {adaptiveTargetMeta.badge.label}
          </Badge>
        {/if}
      </div>
      <div class="text-xs text-muted-foreground">-1 = off</div>
    </div>
    <div class="w-28">
      <Input
        class={cn(adaptiveTargetIgnored && "line-through decoration-muted-foreground")}
        type="number"
        value={$generation.adaptive_target}
        min="-1"
        max="1"
        step="0.01"
        onchange={(e) => handleNumInput("adaptive_target", e)}
      />
    </div>
  </div>
{/snippet}

{#snippet adaptiveDecayRow()}
  <div class={cn("flex items-start justify-between gap-4 border-b py-3", adaptiveDecayIgnored && "opacity-60")}>
    <div class="min-w-0 flex-1 space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <div class="text-sm font-medium text-foreground">Adaptive Decay</div>
        {#if adaptiveDecayMeta.badge}
          <Badge
            variant="outline"
            class={cn(
              "font-mono text-[11px]",
              adaptiveDecayMeta.badge.kind === "warning" &&
                "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
            title={adaptiveDecayMeta.title}
          >
            {adaptiveDecayMeta.badge.label}
          </Badge>
        {/if}
      </div>
      <div class="text-xs text-muted-foreground">0.01–0.99 (higher = slower adaptation)</div>
    </div>
    <div class="w-28">
      <Input
        class={cn(adaptiveDecayIgnored && "line-through decoration-muted-foreground")}
        type="number"
        value={$generation.adaptive_decay}
        min="0.01"
        max="0.99"
        step="0.01"
        onchange={(e) => handleNumInput("adaptive_decay", e)}
      />
    </div>
  </div>
{/snippet}

{#snippet bannedTokensRow()}
  <div class={cn("border-b py-3", bannedTokensIgnored && "opacity-60")}>
    <div class="flex flex-wrap items-center gap-2">
      <div class="text-sm font-medium text-foreground">Banned Tokens</div>
      {#if bannedTokensMeta.badge}
        <Badge
          variant="outline"
          class={cn(
            "font-mono text-[11px]",
            bannedTokensMeta.badge.kind === "warning" &&
              "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
          )}
          title={bannedTokensMeta.title}
        >
          {bannedTokensMeta.badge.label}
        </Badge>
      {/if}
    </div>
    <div class="mt-1 text-xs text-muted-foreground">One per line</div>
    <Textarea
      class={cn("mt-3", bannedTokensIgnored && "line-through decoration-muted-foreground")}
      rows={4}
      bind:value={bannedTokensDraft}
      onblur={commitBannedTokens}
    />
  </div>
{/snippet}

{#snippet logitBiasRow()}
  <div class={cn("border-b py-3", logitBiasIgnored && "opacity-60")}>
    <div class="flex flex-wrap items-center gap-2">
      <div class="text-sm font-medium text-foreground">Logit Bias</div>
      {#if logitBiasMeta.badge}
        <Badge
          variant="outline"
          class={cn(
            "font-mono text-[11px]",
            logitBiasMeta.badge.kind === "warning" &&
              "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
          )}
          title={logitBiasMeta.title}
        >
          {logitBiasMeta.badge.label}
        </Badge>
      {/if}
    </div>
    <div class="mt-1 text-xs text-muted-foreground">JSON object: &#123;"token_id": -100, ...&#125;</div>
    <Textarea
      class={cn("mt-3", logitBiasIgnored && "line-through decoration-muted-foreground")}
      rows={4}
      bind:value={logitBiasDraft}
      onblur={commitLogitBias}
    />
  </div>
{/snippet}

{#snippet dryBreakersRow()}
  <div class={cn("border-b py-3", dryBreakersIgnored && "opacity-60")}>
    <div class="flex flex-wrap items-center gap-2">
      <div class="text-sm font-medium text-foreground">DRY Sequence Breakers</div>
      {#if dryBreakersMeta.badge}
        <Badge
          variant="outline"
          class={cn(
            "font-mono text-[11px]",
            dryBreakersMeta.badge.kind === "warning" &&
              "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
          )}
          title={dryBreakersMeta.title}
        >
          {dryBreakersMeta.badge.label}
        </Badge>
      {/if}
    </div>
    <div class="mt-1 text-xs text-muted-foreground">JSON array of strings (used when DRY Multiplier &gt; 0)</div>
    <Textarea
      class={cn("mt-3", dryBreakersIgnored && "line-through decoration-muted-foreground")}
      rows={4}
      bind:value={dryBreakersDraft}
      onblur={commitDryBreakers}
    />
  </div>
{/snippet}

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <FileSliders class="size-4 text-muted-foreground" aria-hidden="true" />
      Advanced
    </CardTitle>
    <CardDescription>Less common controls and structured fields.</CardDescription>
  </CardHeader>

  <CardContent class="pb-6">
    <div class="rounded-md border bg-card/50 p-4">
      {#if !eosKoboldOnly}
        {@render banEosRow()}
      {/if}

      {#if !renderKoboldOnly}
        {@render renderSpecialRow()}
      {/if}

      {#if !orderKoboldOnly}
        {@render samplerOrderRow()}
      {/if}

      {#if showSmoothMain}
        {#if showTopMain}
          <Separator class="my-4" />
        {/if}

        <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Smooth Sampling</div>
        {#if !smoothingFactorKoboldOnly}
          {@render smoothingFactorRow()}
        {/if}
        {#if !smoothingCurveKoboldOnly}
          {@render smoothingCurveRow()}
        {/if}
      {/if}

      {#if showAdaptiveMain}
        {#if showTopMain || showSmoothMain}
          <Separator class="my-4" />
        {/if}

        <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Adaptive Sampling</div>
        {#if !adaptiveTargetKoboldOnly}
          {@render adaptiveTargetRow()}
        {/if}
        {#if !adaptiveDecayKoboldOnly}
          {@render adaptiveDecayRow()}
        {/if}
      {/if}

      {#if showBansMain}
        {#if showTopMain || showSmoothMain || showAdaptiveMain}
          <Separator class="my-4" />
        {/if}

        <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bans &amp; Bias</div>
        {#if !bannedTokensKoboldOnly}
          {@render bannedTokensRow()}
        {/if}
        {#if !logitBiasKoboldOnly}
          {@render logitBiasRow()}
        {/if}
        {#if !dryBreakersKoboldOnly}
          {@render dryBreakersRow()}
        {/if}
      {/if}

      {#if hasKoboldOnly}
        {#if showTopMain || showSmoothMain || showAdaptiveMain || showBansMain}
          <Separator class="my-4" />
        {/if}

        <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kobold-only</div>
        <div class="mt-1 text-xs text-muted-foreground">Not sent to OpenRouter.</div>

        <div class="mt-3">
          {#if eosKoboldOnly}
            {@render banEosRow()}
          {/if}
          {#if renderKoboldOnly}
            {@render renderSpecialRow()}
          {/if}
          {#if orderKoboldOnly}
            {@render samplerOrderRow()}
          {/if}

          {#if showSmoothKoboldOnly}
            <Separator class="my-4" />
            <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Smooth Sampling</div>
            {#if smoothingFactorKoboldOnly}
              {@render smoothingFactorRow()}
            {/if}
            {#if smoothingCurveKoboldOnly}
              {@render smoothingCurveRow()}
            {/if}
          {/if}

          {#if showAdaptiveKoboldOnly}
            <Separator class="my-4" />
            <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Adaptive Sampling</div>
            {#if adaptiveTargetKoboldOnly}
              {@render adaptiveTargetRow()}
            {/if}
            {#if adaptiveDecayKoboldOnly}
              {@render adaptiveDecayRow()}
            {/if}
          {/if}

          {#if showBansKoboldOnly}
            <Separator class="my-4" />
            <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bans &amp; Bias</div>
            {#if bannedTokensKoboldOnly}
              {@render bannedTokensRow()}
            {/if}
            {#if logitBiasKoboldOnly}
              {@render logitBiasRow()}
            {/if}
            {#if dryBreakersKoboldOnly}
              {@render dryBreakersRow()}
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  </CardContent>
</Card>
