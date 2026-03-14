<script lang="ts">
  import type { GenerationParams, ModelInfo } from "../../../../api/client.js"
  import { connector, generation } from "../../../../stores/settings.js"
  import {
    dynatempParams,
    dryParams,
    mirostatParams,
    otherParams,
    repetitionParams,
    samplingParams,
    xtcParams,
  } from "../../lib/generationParamDefs.js"
  import { getOpenRouterParamStatus, type OpenRouterParamStatus } from "../../lib/openrouterParams.js"
  import { formatSamplerOrder, parseSamplerOrder } from "../../lib/samplerOrder.js"

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

  function getSelectedModel(): ModelInfo | null {
    if ($connector.type !== "openrouter") return null
    return modelSearchResults.find((m) => m.id === $connector.model) ?? null
  }

  function paramStatus(key: keyof GenerationParams): OpenRouterParamStatus {
    if ($connector.type !== "openrouter") return "supported"
    return getOpenRouterParamStatus(key, getSelectedModel())
  }

  function badgeForStatus(status: OpenRouterParamStatus): { label: string; kind: "warning" | "neutral" } | null {
    if (status === "unsupported") return { label: "ignored", kind: "warning" }
    if (status === "not_sent") return { label: "kobold-only", kind: "neutral" }
    if (status === "unknown") return { label: "unknown", kind: "neutral" }
    return null
  }

  function titleForStatus(status: OpenRouterParamStatus): string {
    if (status === "unsupported") return "This parameter is not supported by the selected OpenRouter model"
    if (status === "not_sent") return "This parameter is KoboldCpp-only and is not sent to OpenRouter"
    if (status === "unknown")
      return "Model parameter metadata is not available; this parameter may be ignored by OpenRouter"
    return ""
  }

  const allParamDefs = [
    ...samplingParams,
    ...repetitionParams,
    ...dryParams,
    ...mirostatParams,
    ...dynatempParams,
    ...xtcParams,
    ...otherParams,
  ]

  function labelForKey(key: keyof GenerationParams): string {
    const found = allParamDefs.find((p) => p.key === key)
    if (found) return found.label
    if (key === "ban_eos_token") return "Ban EOS Token"
    if (key === "render_special") return "Render Special Tokens"
    if (key === "sampler_order") return "Sampler Order"
    if (key === "smoothing_factor") return "Smoothing Factor"
    if (key === "smoothing_curve") return "Smoothing Curve"
    if (key === "adaptive_target") return "Adaptive Target"
    if (key === "adaptive_decay") return "Adaptive Decay"
    if (key === "banned_tokens") return "Banned Tokens"
    if (key === "dry_sequence_breakers") return "DRY Sequence Breakers"
    if (key === "logit_bias") return "Logit Bias"
    return String(key)
  }

  const openRouterPageKeys = [
    ...new Set([
      ...allParamDefs.map((p) => p.key),
      "ban_eos_token",
      "render_special",
      "sampler_order",
      "smoothing_factor",
      "smoothing_curve",
      "adaptive_target",
      "adaptive_decay",
      "banned_tokens",
      "dry_sequence_breakers",
      "logit_bias",
    ] as Array<keyof GenerationParams>),
  ]

  let openRouterSummary = $derived.by(() => {
    if ($connector.type !== "openrouter") return null
    const keys = openRouterPageKeys
    const model = getSelectedModel()
    const statusByKey = new Map<keyof GenerationParams, OpenRouterParamStatus>()
    for (const k of keys) statusByKey.set(k, getOpenRouterParamStatus(k, model))
    const notSent = keys.filter((k) => statusByKey.get(k) === "not_sent")
    const unknown = keys.filter((k) => statusByKey.get(k) === "unknown")
    const unsupported = keys.filter((k) => statusByKey.get(k) === "unsupported")
    const supported = keys.filter((k) => statusByKey.get(k) === "supported")
    const sentKeys = [...supported, ...unsupported, ...unknown]
    return {
      modelId: $connector.model,
      modelHasMeta: !!model?.supported_parameters && model.supported_parameters.length > 0,
      keys,
      notSent,
      unknown,
      unsupported,
      supported,
      sentKeys,
    }
  })

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

{#if openRouterSummary}
  <div class="notice" role="note">
    <div class="notice__row">
      <span class="notice__icon" aria-hidden="true">ℹ</span>
      <div>
        <div class="notice__title">OpenRouter parameter support</div>
        <div class="notice__body">
          Some settings are ignored by OpenRouter, either because they are KoboldCpp-only or not supported by the
          selected model. Badges explain what happens.
        </div>
        <ul class="notice__list">
          <li><span class="badge">kobold-only</span> not sent to OpenRouter</li>
          <li><span class="badge badge--warning">ignored</span> sent, but model does not support</li>
          <li><span class="badge">unknown</span> model metadata missing (best-effort)</li>
        </ul>
      </div>
    </div>
  </div>

  <details class="disclosure">
    <summary class="disclosure__summary">
      What will be used for <span class="mono">{openRouterSummary.modelId}</span>
    </summary>
    <div class="disclosure__content">
      <div class="disclosure__hint">
        {openRouterSummary.sentKeys.length} setting(s) are sent to OpenRouter. {openRouterSummary.notSent.length} are KoboldCpp-only.
        {#if openRouterSummary.modelHasMeta}
          {openRouterSummary.unsupported.length} are unsupported by this model.
        {:else}
          Model support metadata is not loaded.
        {/if}
      </div>
      <div class="disclosure__grid">
        <div>
          <div class="disclosure__label">Sent</div>
          <div class="disclosure__chips">
            {#each openRouterSummary.sentKeys as k}
              <span class="chip">{labelForKey(k)}</span>
            {/each}
          </div>
        </div>
        <div>
          <div class="disclosure__label">Not sent</div>
          <div class="disclosure__chips">
            {#each openRouterSummary.notSent as k}
              <span class="chip chip--dim">{labelForKey(k)}</span>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </details>
{/if}

<div class="control-section-label">Sampling</div>
{#each samplingParams as p}
  {@const status = paramStatus(p.key)}
  {@const badge = badgeForStatus(status)}
  <label class="control-row control-row--input" class:param-ignored={status === "unsupported" || status === "not_sent"}>
    <span class="control-row-text">
      <span class="control-row-title">
        {p.label}
        {#if badge}
          <span class="badge" class:badge--warning={badge.kind === "warning"} title={titleForStatus(status)}>
            {badge.label}
          </span>
        {/if}
      </span>
      <span class="control-row-sub">{p.sub}</span>
    </span>
    <input
      class="num-input"
      type="number"
      value={$generation[p.key]}
      min={p.min}
      max={p.max}
      step={p.step}
      onchange={(e) => handleNumInput(p.key, e, p.int)}
    />
  </label>
{/each}

<div class="divider"></div>

<div class="control-section-label">Repetition Penalties</div>
{#each repetitionParams as p}
  {@const status = paramStatus(p.key)}
  {@const badge = badgeForStatus(status)}
  <label class="control-row control-row--input" class:param-ignored={status === "unsupported" || status === "not_sent"}>
    <span class="control-row-text">
      <span class="control-row-title">
        {p.label}
        {#if badge}
          <span class="badge" class:badge--warning={badge.kind === "warning"} title={titleForStatus(status)}>
            {badge.label}
          </span>
        {/if}
      </span>
      <span class="control-row-sub">{p.sub}</span>
    </span>
    <input
      class="num-input"
      type="number"
      value={$generation[p.key]}
      min={p.min}
      max={p.max}
      step={p.step}
      onchange={(e) => handleNumInput(p.key, e, p.int)}
    />
  </label>
{/each}

<div class="divider"></div>

<div class="control-section-label">DRY (Diverse Repetition Penalty)</div>
{#each dryParams as p}
  {@const status = paramStatus(p.key)}
  {@const badge = badgeForStatus(status)}
  <label class="control-row control-row--input" class:param-ignored={status === "unsupported" || status === "not_sent"}>
    <span class="control-row-text">
      <span class="control-row-title">
        {p.label}
        {#if badge}
          <span class="badge" class:badge--warning={badge.kind === "warning"} title={titleForStatus(status)}>
            {badge.label}
          </span>
        {/if}
      </span>
      <span class="control-row-sub">{p.sub}</span>
    </span>
    <input
      class="num-input"
      type="number"
      value={$generation[p.key]}
      min={p.min}
      max={p.max}
      step={p.step}
      onchange={(e) => handleNumInput(p.key, e, p.int)}
    />
  </label>
{/each}

<div class="divider"></div>

<div class="control-section-label">Mirostat</div>
{#each mirostatParams as p}
  {@const status = paramStatus(p.key)}
  {@const badge = badgeForStatus(status)}
  <label class="control-row control-row--input" class:param-ignored={status === "unsupported" || status === "not_sent"}>
    <span class="control-row-text">
      <span class="control-row-title">
        {p.label}
        {#if badge}
          <span class="badge" class:badge--warning={badge.kind === "warning"} title={titleForStatus(status)}>
            {badge.label}
          </span>
        {/if}
      </span>
      <span class="control-row-sub">{p.sub}</span>
    </span>
    <input
      class="num-input"
      type="number"
      value={$generation[p.key]}
      min={p.min}
      max={p.max}
      step={p.step}
      onchange={(e) => handleNumInput(p.key, e, p.int)}
    />
  </label>
{/each}

<div class="divider"></div>

<div class="control-section-label">Dynamic Temperature</div>
{#each dynatempParams as p}
  {@const status = paramStatus(p.key)}
  {@const badge = badgeForStatus(status)}
  <label class="control-row control-row--input" class:param-ignored={status === "unsupported" || status === "not_sent"}>
    <span class="control-row-text">
      <span class="control-row-title">
        {p.label}
        {#if badge}
          <span class="badge" class:badge--warning={badge.kind === "warning"} title={titleForStatus(status)}>
            {badge.label}
          </span>
        {/if}
      </span>
      <span class="control-row-sub">{p.sub}</span>
    </span>
    <input
      class="num-input"
      type="number"
      value={$generation[p.key]}
      min={p.min}
      max={p.max}
      step={p.step}
      onchange={(e) => handleNumInput(p.key, e, p.int)}
    />
  </label>
{/each}

<div class="divider"></div>

<div class="control-section-label">XTC (Token Cutting)</div>
{#each xtcParams as p}
  {@const status = paramStatus(p.key)}
  {@const badge = badgeForStatus(status)}
  <label class="control-row control-row--input" class:param-ignored={status === "unsupported" || status === "not_sent"}>
    <span class="control-row-text">
      <span class="control-row-title">
        {p.label}
        {#if badge}
          <span class="badge" class:badge--warning={badge.kind === "warning"} title={titleForStatus(status)}>
            {badge.label}
          </span>
        {/if}
      </span>
      <span class="control-row-sub">{p.sub}</span>
    </span>
    <input
      class="num-input"
      type="number"
      value={$generation[p.key]}
      min={p.min}
      max={p.max}
      step={p.step}
      onchange={(e) => handleNumInput(p.key, e, p.int)}
    />
  </label>
{/each}

<div class="divider"></div>

<div class="control-section-label">Other</div>
{#each otherParams as p}
  {@const status = paramStatus(p.key)}
  {@const badge = badgeForStatus(status)}
  <label class="control-row control-row--input" class:param-ignored={status === "unsupported" || status === "not_sent"}>
    <span class="control-row-text">
      <span class="control-row-title">
        {p.label}
        {#if badge}
          <span class="badge" class:badge--warning={badge.kind === "warning"} title={titleForStatus(status)}>
            {badge.label}
          </span>
        {/if}
      </span>
      <span class="control-row-sub">{p.sub}</span>
    </span>
    <input
      class="num-input"
      type="number"
      value={$generation[p.key]}
      min={p.min}
      max={p.max}
      step={p.step}
      onchange={(e) => handleNumInput(p.key, e, p.int)}
    />
  </label>
{/each}

<div class="divider"></div>

<div class="control-section-label">Advanced</div>

{@const eosStatus = paramStatus("ban_eos_token")}
{@const eosBadge = badgeForStatus(eosStatus)}
<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">
      Ban EOS Token
      {#if eosBadge}
        <span class="badge" class:badge--warning={eosBadge.kind === "warning"} title={titleForStatus(eosStatus)}>
          {eosBadge.label}
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

{@const renderStatus = paramStatus("render_special")}
{@const renderBadge = badgeForStatus(renderStatus)}
<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">
      Render Special Tokens
      {#if renderBadge}
        <span class="badge" class:badge--warning={renderBadge.kind === "warning"} title={titleForStatus(renderStatus)}>
          {renderBadge.label}
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

{@const orderStatus = paramStatus("sampler_order")}
{@const orderBadge = badgeForStatus(orderStatus)}
<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">
      Sampler Order
      {#if orderBadge}
        <span class="badge" class:badge--warning={orderBadge.kind === "warning"} title={titleForStatus(orderStatus)}>
          {orderBadge.label}
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
{@const smoothingFactorStatus = paramStatus("smoothing_factor")}
{@const smoothingFactorBadge = badgeForStatus(smoothingFactorStatus)}
<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">
      Smoothing Factor
      {#if smoothingFactorBadge}
        <span
          class="badge"
          class:badge--warning={smoothingFactorBadge.kind === "warning"}
          title={titleForStatus(smoothingFactorStatus)}
        >
          {smoothingFactorBadge.label}
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

{@const smoothingCurveStatus = paramStatus("smoothing_curve")}
{@const smoothingCurveBadge = badgeForStatus(smoothingCurveStatus)}
<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">
      Smoothing Curve
      {#if smoothingCurveBadge}
        <span
          class="badge"
          class:badge--warning={smoothingCurveBadge.kind === "warning"}
          title={titleForStatus(smoothingCurveStatus)}
        >
          {smoothingCurveBadge.label}
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
{@const adaptiveTargetStatus = paramStatus("adaptive_target")}
{@const adaptiveTargetBadge = badgeForStatus(adaptiveTargetStatus)}
<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">
      Adaptive Target
      {#if adaptiveTargetBadge}
        <span
          class="badge"
          class:badge--warning={adaptiveTargetBadge.kind === "warning"}
          title={titleForStatus(adaptiveTargetStatus)}
        >
          {adaptiveTargetBadge.label}
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

{@const adaptiveDecayStatus = paramStatus("adaptive_decay")}
{@const adaptiveDecayBadge = badgeForStatus(adaptiveDecayStatus)}
<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">
      Adaptive Decay
      {#if adaptiveDecayBadge}
        <span
          class="badge"
          class:badge--warning={adaptiveDecayBadge.kind === "warning"}
          title={titleForStatus(adaptiveDecayStatus)}
        >
          {adaptiveDecayBadge.label}
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

{@const bannedTokensStatus = paramStatus("banned_tokens")}
{@const bannedTokensBadge = badgeForStatus(bannedTokensStatus)}
<label class="control-row control-row--input control-row--stack">
  <span class="control-row-text">
    <span class="control-row-title">
      Banned Tokens
      {#if bannedTokensBadge}
        <span
          class="badge"
          class:badge--warning={bannedTokensBadge.kind === "warning"}
          title={titleForStatus(bannedTokensStatus)}
        >
          {bannedTokensBadge.label}
        </span>
      {/if}
    </span>
    <span class="control-row-sub">One per line</span>
  </span>
  <textarea class="text-input" rows="4" bind:value={bannedTokensDraft} onblur={commitBannedTokens}></textarea>
</label>

{@const logitBiasStatus = paramStatus("logit_bias")}
{@const logitBiasBadge = badgeForStatus(logitBiasStatus)}
<label class="control-row control-row--input control-row--stack">
  <span class="control-row-text">
    <span class="control-row-title">
      Logit Bias
      {#if logitBiasBadge}
        <span
          class="badge"
          class:badge--warning={logitBiasBadge.kind === "warning"}
          title={titleForStatus(logitBiasStatus)}
        >
          {logitBiasBadge.label}
        </span>
      {/if}
    </span>
    <span class="control-row-sub">JSON object: &#123;"token_id": -100, ...&#125;</span>
  </span>
  <textarea class="text-input" rows="4" bind:value={logitBiasDraft} onblur={commitLogitBias}></textarea>
</label>

{@const dryBreakersStatus = paramStatus("dry_sequence_breakers")}
{@const dryBreakersBadge = badgeForStatus(dryBreakersStatus)}
<label class="control-row control-row--input control-row--stack">
  <span class="control-row-text">
    <span class="control-row-title">
      DRY Sequence Breakers
      {#if dryBreakersBadge}
        <span
          class="badge"
          class:badge--warning={dryBreakersBadge.kind === "warning"}
          title={titleForStatus(dryBreakersStatus)}
        >
          {dryBreakersBadge.label}
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

  .mono {
    font-family: var(--font-mono);
  }

  .disclosure__content {
    padding: 0.65rem 0.75rem 0.75rem;
  }

  .disclosure__hint {
    font-size: 0.78rem;
    color: var(--text-dim);
    line-height: 1.4;
  }

  .disclosure__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    margin-top: 0.65rem;
  }

  @media (min-width: 760px) {
    .disclosure__grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  .disclosure__label {
    font-family: var(--font-ui);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-bottom: 0.35rem;
  }

  .disclosure__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    color: var(--text);
    background: color-mix(in srgb, var(--bg-action) 70%, transparent);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.15rem 0.5rem;
    line-height: 1.2;
  }

  .chip--dim {
    color: var(--text-dim);
    background: color-mix(in srgb, var(--bg-action) 55%, transparent);
  }
</style>
