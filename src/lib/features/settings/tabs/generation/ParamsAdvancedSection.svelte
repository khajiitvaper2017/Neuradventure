<script lang="ts">
  import type { GenerationParams, ModelInfo } from "@/shared/api-types"
  import { connector, generation } from "@/stores/settings"
  import { formatSamplerOrder, parseSamplerOrder } from "@/features/settings/lib/samplerOrder"
  import OpenRouterParamNotice from "@/features/settings/tabs/generation/OpenRouterParamNotice.svelte"
  import { keyMeta } from "@/features/settings/tabs/generation/openRouterParamSupport"

  type Props = {
    modelSearchResults?: ModelInfo[]
  }

  let { modelSearchResults = [] }: Props = $props()

  let samplerOrderDraft = $state(formatSamplerOrder($generation.sampler_order))
  let dryBreakersDraft = $state(JSON.stringify($generation.dry_sequence_breakers, null, 2))
  let bannedTokensDraft = $state($generation.banned_tokens.join("\n"))
  let logitBiasDraft = $state(JSON.stringify($generation.logit_bias, null, 2))

  $effect(() => {
    samplerOrderDraft = formatSamplerOrder($generation.sampler_order)
  })
  $effect(() => {
    dryBreakersDraft = JSON.stringify($generation.dry_sequence_breakers, null, 2)
  })
  $effect(() => {
    bannedTokensDraft = $generation.banned_tokens.join("\n")
  })
  $effect(() => {
    logitBiasDraft = JSON.stringify($generation.logit_bias, null, 2)
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

<OpenRouterParamNotice {modelSearchResults} />

<div class="control-section-label">Advanced</div>

<label
  class="control-row control-row--input"
  class:param-ignored={eosMeta.status === "unsupported" || eosMeta.status === "not_sent"}
>
  <span class="control-row-text">
    <span class="control-row-title">
      Ban EOS Token
      {#if eosMeta.badge}
        <span class="badge" class:badge--warning={eosMeta.badge.kind === "warning"} title={eosMeta.title}>
          {eosMeta.badge.label}
        </span>
      {/if}
    </span>
    <span class="control-row-sub">Prevent the model from ending early</span>
  </span>
  <input
    type="checkbox"
    checked={$generation.ban_eos_token}
    onchange={(e) => setGen("ban_eos_token", (e.target as HTMLInputElement).checked)}
  />
</label>

<label
  class="control-row control-row--input"
  class:param-ignored={renderMeta.status === "unsupported" || renderMeta.status === "not_sent"}
>
  <span class="control-row-text">
    <span class="control-row-title">
      Render Special Tokens
      {#if renderMeta.badge}
        <span class="badge" class:badge--warning={renderMeta.badge.kind === "warning"} title={renderMeta.title}>
          {renderMeta.badge.label}
        </span>
      {/if}
    </span>
    <span class="control-row-sub">Show special tokens in output (debug)</span>
  </span>
  <input
    type="checkbox"
    checked={$generation.render_special}
    onchange={(e) => setGen("render_special", (e.target as HTMLInputElement).checked)}
  />
</label>

<label
  class="control-row control-row--input"
  class:param-ignored={orderMeta.status === "unsupported" || orderMeta.status === "not_sent"}
>
  <span class="control-row-text">
    <span class="control-row-title">
      Sampler Order
      {#if orderMeta.badge}
        <span class="badge" class:badge--warning={orderMeta.badge.kind === "warning"} title={orderMeta.title}>
          {orderMeta.badge.label}
        </span>
      {/if}
    </span>
    <span class="control-row-sub">Comma-separated list (Kobold default: 6,0,1,3,4,2,5)</span>
  </span>
  <input
    class="text-input"
    type="text"
    bind:value={samplerOrderDraft}
    onblur={commitSamplerOrder}
    onkeydown={(e) => {
      if (e.key === "Enter") (e.target as HTMLInputElement).blur()
    }}
  />
</label>

<div class="divider"></div>

<div class="control-section-label">Smooth Sampling</div>
<label
  class="control-row control-row--input"
  class:param-ignored={smoothingFactorMeta.status === "unsupported" || smoothingFactorMeta.status === "not_sent"}
>
  <span class="control-row-text">
    <span class="control-row-title">
      Smoothing Factor
      {#if smoothingFactorMeta.badge}
        <span
          class="badge"
          class:badge--warning={smoothingFactorMeta.badge.kind === "warning"}
          title={smoothingFactorMeta.title}
        >
          {smoothingFactorMeta.badge.label}
        </span>
      {/if}
    </span>
    <span class="control-row-sub">0 = off</span>
  </span>
  <input
    class="num-input"
    type="number"
    value={$generation.smoothing_factor}
    min="0"
    max="1"
    step="0.01"
    onchange={(e) => handleNumInput("smoothing_factor", e)}
  />
</label>

<label
  class="control-row control-row--input"
  class:param-ignored={smoothingCurveMeta.status === "unsupported" || smoothingCurveMeta.status === "not_sent"}
>
  <span class="control-row-text">
    <span class="control-row-title">
      Smoothing Curve
      {#if smoothingCurveMeta.badge}
        <span
          class="badge"
          class:badge--warning={smoothingCurveMeta.badge.kind === "warning"}
          title={smoothingCurveMeta.title}
        >
          {smoothingCurveMeta.badge.label}
        </span>
      {/if}
    </span>
    <span class="control-row-sub">Curve shaping for smoothing</span>
  </span>
  <input
    class="num-input"
    type="number"
    value={$generation.smoothing_curve}
    min="0.1"
    max="5"
    step="0.1"
    onchange={(e) => handleNumInput("smoothing_curve", e)}
  />
</label>

<div class="divider"></div>

<div class="control-section-label">Adaptive Sampling</div>
<label
  class="control-row control-row--input"
  class:param-ignored={adaptiveTargetMeta.status === "unsupported" || adaptiveTargetMeta.status === "not_sent"}
>
  <span class="control-row-text">
    <span class="control-row-title">
      Adaptive Target
      {#if adaptiveTargetMeta.badge}
        <span
          class="badge"
          class:badge--warning={adaptiveTargetMeta.badge.kind === "warning"}
          title={adaptiveTargetMeta.title}
        >
          {adaptiveTargetMeta.badge.label}
        </span>
      {/if}
    </span>
    <span class="control-row-sub">-1 = off</span>
  </span>
  <input
    class="num-input"
    type="number"
    value={$generation.adaptive_target}
    min="-1"
    max="1"
    step="0.01"
    onchange={(e) => handleNumInput("adaptive_target", e)}
  />
</label>

<label
  class="control-row control-row--input"
  class:param-ignored={adaptiveDecayMeta.status === "unsupported" || adaptiveDecayMeta.status === "not_sent"}
>
  <span class="control-row-text">
    <span class="control-row-title">
      Adaptive Decay
      {#if adaptiveDecayMeta.badge}
        <span
          class="badge"
          class:badge--warning={adaptiveDecayMeta.badge.kind === "warning"}
          title={adaptiveDecayMeta.title}
        >
          {adaptiveDecayMeta.badge.label}
        </span>
      {/if}
    </span>
    <span class="control-row-sub">0.01–0.99 (higher = slower adaptation)</span>
  </span>
  <input
    class="num-input"
    type="number"
    value={$generation.adaptive_decay}
    min="0.01"
    max="0.99"
    step="0.01"
    onchange={(e) => handleNumInput("adaptive_decay", e)}
  />
</label>

<div class="divider"></div>

<div class="control-section-label">Bans & Bias</div>

<label
  class="control-row control-row--input control-row--stack"
  class:param-ignored={bannedTokensMeta.status === "unsupported" || bannedTokensMeta.status === "not_sent"}
>
  <span class="control-row-text">
    <span class="control-row-title">
      Banned Tokens
      {#if bannedTokensMeta.badge}
        <span
          class="badge"
          class:badge--warning={bannedTokensMeta.badge.kind === "warning"}
          title={bannedTokensMeta.title}
        >
          {bannedTokensMeta.badge.label}
        </span>
      {/if}
    </span>
    <span class="control-row-sub">One per line</span>
  </span>
  <textarea class="text-input" rows="4" bind:value={bannedTokensDraft} onblur={commitBannedTokens}></textarea>
</label>

<label
  class="control-row control-row--input control-row--stack"
  class:param-ignored={logitBiasMeta.status === "unsupported" || logitBiasMeta.status === "not_sent"}
>
  <span class="control-row-text">
    <span class="control-row-title">
      Logit Bias
      {#if logitBiasMeta.badge}
        <span class="badge" class:badge--warning={logitBiasMeta.badge.kind === "warning"} title={logitBiasMeta.title}>
          {logitBiasMeta.badge.label}
        </span>
      {/if}
    </span>
    <span class="control-row-sub">JSON object: &#123;"token_id": -100, ...&#125;</span>
  </span>
  <textarea class="text-input" rows="4" bind:value={logitBiasDraft} onblur={commitLogitBias}></textarea>
</label>

<label
  class="control-row control-row--input control-row--stack"
  class:param-ignored={dryBreakersMeta.status === "unsupported" || dryBreakersMeta.status === "not_sent"}
>
  <span class="control-row-text">
    <span class="control-row-title">
      DRY Sequence Breakers
      {#if dryBreakersMeta.badge}
        <span
          class="badge"
          class:badge--warning={dryBreakersMeta.badge.kind === "warning"}
          title={dryBreakersMeta.title}
        >
          {dryBreakersMeta.badge.label}
        </span>
      {/if}
    </span>
    <span class="control-row-sub">JSON array of strings (used when DRY Multiplier &gt; 0)</span>
  </span>
  <textarea class="text-input" rows="4" bind:value={dryBreakersDraft} onblur={commitDryBreakers}></textarea>
</label>

<div class="settings-bottom-pad"></div>

<style>
  .param-ignored {
    opacity: 0.62;
  }

  .param-ignored .num-input,
  .param-ignored .text-input {
    text-decoration: line-through;
    text-decoration-color: var(--text-dim);
  }
</style>
