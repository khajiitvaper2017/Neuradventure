<script lang="ts">
  import type { GenerationParams, ModelInfo } from "@/shared/api-types"
  import { connector } from "@/stores/settings"
  import {
    dynatempParams,
    dryParams,
    mirostatParams,
    otherParams,
    repetitionParams,
    samplingParams,
    xtcParams,
  } from "@/features/settings/lib/generationParamDefs"
  import { getSelectedModel } from "@/features/settings/tabs/generation/openRouterParamSupport"
  import { getOpenRouterParamStatus, type OpenRouterParamStatus } from "@/features/settings/lib/openrouterParams"

  type Props = {
    modelSearchResults?: ModelInfo[]
  }

  let { modelSearchResults = [] }: Props = $props()

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
  ].filter((k) => k !== "ctx_limit")

  let openRouterSummary = $derived.by(() => {
    if ($connector.type !== "openrouter") return null
    const model = getSelectedModel($connector, modelSearchResults)
    const statusByKey = new Map<keyof GenerationParams, OpenRouterParamStatus>()
    for (const k of openRouterPageKeys) statusByKey.set(k, getOpenRouterParamStatus(k, model))
    const notSent = openRouterPageKeys.filter((k) => statusByKey.get(k) === "not_sent")
    const unknown = openRouterPageKeys.filter((k) => statusByKey.get(k) === "unknown")
    const unsupported = openRouterPageKeys.filter((k) => statusByKey.get(k) === "unsupported")
    const supported = openRouterPageKeys.filter((k) => statusByKey.get(k) === "supported")
    const sentKeys = [...supported, ...unsupported, ...unknown]
    return {
      modelId: $connector.model,
      modelHasMeta: !!model?.supported_parameters && model.supported_parameters.length > 0,
      notSent,
      unsupported,
      sentKeys,
    }
  })
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
          <li>Model support metadata can be missing until models are fetched</li>
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

<style>
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
