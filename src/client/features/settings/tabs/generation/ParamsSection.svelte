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
  import { PARAM_TO_OPENROUTER } from "../../lib/openrouterParams.js"
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

  function isParamUnsupported(key: keyof GenerationParams): boolean {
    if ($connector.type !== "openrouter") return false
    const orParam = PARAM_TO_OPENROUTER[key]
    if (!orParam) return false
    const model = modelSearchResults.find((m) => m.id === $connector.model)
    if (!model?.supported_parameters) return false
    return !model.supported_parameters.includes(orParam)
  }

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

<div class="control-section-label">Sampling</div>
{#each samplingParams as p}
  {@const unsupported = isParamUnsupported(p.key)}
  <label class="control-row control-row--input" class:param-unsupported={unsupported}>
    <span class="control-row-text">
      <span class="control-row-title">
        {p.label}
        {#if unsupported}
          <span class="unsupported-badge" title="This parameter is not supported by the selected model">ignored</span>
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
  {@const unsupported = isParamUnsupported(p.key)}
  <label class="control-row control-row--input" class:param-unsupported={unsupported}>
    <span class="control-row-text">
      <span class="control-row-title">
        {p.label}
        {#if unsupported}
          <span class="unsupported-badge" title="This parameter is not supported by the selected model">ignored</span>
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
  <label class="control-row control-row--input">
    <span class="control-row-text">
      <span class="control-row-title">{p.label}</span>
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
  <label class="control-row control-row--input">
    <span class="control-row-text">
      <span class="control-row-title">{p.label}</span>
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
  <label class="control-row control-row--input">
    <span class="control-row-text">
      <span class="control-row-title">{p.label}</span>
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
  <label class="control-row control-row--input">
    <span class="control-row-text">
      <span class="control-row-title">{p.label}</span>
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
  <label class="control-row control-row--input">
    <span class="control-row-text">
      <span class="control-row-title">{p.label}</span>
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

<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Ban EOS Token</span>
    <span class="control-row-sub">Prevent the model from ending early</span>
  </span>
  <input
    type="checkbox"
    checked={$generation.ban_eos_token}
    onchange={(e) => setGen("ban_eos_token", (e.target as HTMLInputElement).checked)}
  />
</label>

<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Render Special Tokens</span>
    <span class="control-row-sub">Show special tokens in output (debug)</span>
  </span>
  <input
    type="checkbox"
    checked={$generation.render_special}
    onchange={(e) => setGen("render_special", (e.target as HTMLInputElement).checked)}
  />
</label>

<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Sampler Order</span>
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
<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Smoothing Factor</span>
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

<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Smoothing Curve</span>
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
<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Adaptive Target</span>
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

<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Adaptive Decay</span>
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

<label class="control-row control-row--input control-row--stack">
  <span class="control-row-text">
    <span class="control-row-title">Banned Tokens</span>
    <span class="control-row-sub">One per line</span>
  </span>
  <textarea class="text-input" rows="4" bind:value={bannedTokensDraft} onblur={commitBannedTokens}></textarea>
</label>

<label class="control-row control-row--input control-row--stack">
  <span class="control-row-text">
    <span class="control-row-title">Logit Bias</span>
    <span class="control-row-sub">JSON object: &#123;"token_id": -100, ...&#125;</span>
  </span>
  <textarea class="text-input" rows="4" bind:value={logitBiasDraft} onblur={commitLogitBias}></textarea>
</label>

<label class="control-row control-row--input control-row--stack">
  <span class="control-row-text">
    <span class="control-row-title">DRY Sequence Breakers</span>
    <span class="control-row-sub">JSON array of strings (used when DRY Multiplier &gt; 0)</span>
  </span>
  <textarea class="text-input" rows="4" bind:value={dryBreakersDraft} onblur={commitDryBreakers}></textarea>
</label>

<div class="settings-bottom-pad"></div>

<style>
  .param-unsupported {
    opacity: 0.55;
  }

  .param-unsupported .num-input {
    text-decoration: line-through;
    text-decoration-color: var(--text-dim);
  }

  .unsupported-badge {
    display: inline-block;
    font-family: var(--font-ui);
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--warning, #c27a1a);
    background: var(--warning-bg, rgba(194, 122, 26, 0.12));
    border: 1px solid var(--warning-border, rgba(194, 122, 26, 0.25));
    border-radius: 3px;
    padding: 0.1em 0.4em;
    margin-left: 0.5em;
    vertical-align: middle;
    line-height: 1.4;
  }

  .settings-bottom-pad {
    height: 2rem;
  }
</style>
