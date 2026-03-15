<script lang="ts">
  import type { GenerationParams, ModelInfo } from "@/shared/api-types"
  import { connector } from "@/stores/settings"
  import { Badge } from "@/components/ui/badge"
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
  <div class="rounded-lg border bg-card p-4 text-sm text-card-foreground" role="note">
    <div class="flex gap-3">
      <div class="mt-0.5 text-muted-foreground" aria-hidden="true">ℹ</div>
      <div class="space-y-2">
        <div class="font-medium">OpenRouter parameter support</div>
        <div class="text-xs text-muted-foreground">
          Some settings are ignored by OpenRouter, either because they are KoboldCpp-only or not supported by the
          selected model. Badges explain what happens.
        </div>
        <ul class="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          <li><Badge variant="secondary">kobold-only</Badge> not sent to OpenRouter</li>
          <li><Badge variant="outline">ignored</Badge> sent, but model does not support</li>
          <li>Model support metadata can be missing until models are fetched</li>
        </ul>
      </div>
    </div>
  </div>

  <details class="mt-3 overflow-hidden rounded-lg border bg-card text-sm text-card-foreground">
    <summary class="cursor-pointer select-none px-4 py-3 font-medium">
      What will be used for <span class="font-mono text-xs">{openRouterSummary.modelId}</span>
    </summary>
    <div class="space-y-3 border-t px-4 py-4">
      <div class="text-xs text-muted-foreground">
        {openRouterSummary.sentKeys.length} setting(s) are sent to OpenRouter. {openRouterSummary.notSent.length} are KoboldCpp-only.
        {#if openRouterSummary.modelHasMeta}
          {openRouterSummary.unsupported.length} are unsupported by this model.
        {:else}
          Model support metadata is not loaded.
        {/if}
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="space-y-2">
          <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sent</div>
          <div class="flex flex-wrap gap-2">
            {#each openRouterSummary.sentKeys as k}
              <Badge variant="secondary" class="px-2 py-0 text-[11px] font-medium">
                {labelForKey(k)}
              </Badge>
            {/each}
          </div>
        </div>
        <div class="space-y-2">
          <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Not sent</div>
          <div class="flex flex-wrap gap-2">
            {#each openRouterSummary.notSent as k}
              <Badge variant="outline" class="px-2 py-0 text-[11px] font-medium opacity-70">
                {labelForKey(k)}
              </Badge>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </details>
{/if}
