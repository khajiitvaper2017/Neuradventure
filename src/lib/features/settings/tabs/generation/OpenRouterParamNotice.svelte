<script lang="ts">
  import type { GenerationParams, ModelInfo } from "@/shared/api-types"
  import { connector } from "@/stores/settings"
  import { SvelteMap } from "svelte/reactivity"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent } from "@/components/ui/card"
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
  import { BadgeCheck, ChevronDown, ChevronUp, CircleSlash, Info, Send, TriangleAlert } from "@lucide/svelte"

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
    const statusByKey = new SvelteMap<keyof GenerationParams, OpenRouterParamStatus>()
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
      unknown,
      supported,
      unsupported,
      sentKeys,
    }
  })

  let showDetails = $state(false)
  $effect(() => {
    const id = openRouterSummary?.modelId
    if (!id) return
    showDetails = false
  })
</script>

{#if openRouterSummary}
  <Card class="border-border/70 bg-card text-card-foreground">
    <CardContent class="space-y-2 p-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <Info class="size-4 text-muted-foreground" aria-hidden="true" />
            <div class="text-sm font-medium leading-none">OpenRouter param support</div>
            <Badge
              variant="outline"
              class="max-w-[55vw] truncate font-mono text-[11px] text-muted-foreground"
              title={openRouterSummary.modelId}
            >
              {openRouterSummary.modelId}
            </Badge>
          </div>

          <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" class="gap-1 px-2 py-0 text-[11px] font-medium" title="Applied by OpenRouter">
              <BadgeCheck class="size-3.5" aria-hidden="true" />
              {openRouterSummary.supported.length} applied
            </Badge>

            <Badge
              variant="outline"
              class="gap-1 px-2 py-0 text-[11px] font-medium"
              title={openRouterSummary.modelHasMeta
                ? "Sent, but not supported by this model"
                : "Model metadata not loaded; support may be unknown"}
            >
              <CircleSlash class="size-3.5" aria-hidden="true" />
              {openRouterSummary.modelHasMeta ? openRouterSummary.unsupported.length : "—"} ignored
            </Badge>

            <Badge variant="secondary" class="gap-1 px-2 py-0 text-[11px] font-medium" title="Not sent to OpenRouter">
              <Send class="size-3.5" aria-hidden="true" />
              {openRouterSummary.notSent.length} not sent
            </Badge>

            <Badge
              variant="outline"
              class="gap-1 px-2 py-0 text-[11px] font-medium opacity-80"
              title={openRouterSummary.modelHasMeta ? "Sent, but metadata has no match" : "Model metadata not loaded"}
            >
              <TriangleAlert class="size-3.5" aria-hidden="true" />
              {openRouterSummary.modelHasMeta ? openRouterSummary.unknown.length : "meta"} unknown
            </Badge>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          class="shrink-0"
          onclick={() => (showDetails = !showDetails)}
          aria-expanded={showDetails}
        >
          {#if showDetails}
            <ChevronUp class="size-4" aria-hidden="true" />
            <span class="sr-only">Hide details</span>
          {:else}
            <ChevronDown class="size-4" aria-hidden="true" />
            <span class="sr-only">Show details</span>
          {/if}
        </Button>
      </div>

      {#if showDetails}
        <div class="max-h-56 overflow-auto rounded-lg border bg-background/30 p-3">
          <div class="grid gap-4 sm:grid-cols-3">
            <div class="space-y-2">
              <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Applied</div>
              <div class="flex flex-wrap gap-2">
                {#each openRouterSummary.supported as k (k)}
                  <Badge variant="secondary" class="px-2 py-0 text-[11px] font-medium">
                    {labelForKey(k)}
                  </Badge>
                {/each}
              </div>
            </div>

            <div class="space-y-2">
              <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sent (unknown/ignored)
              </div>
              <div class="flex flex-wrap gap-2">
                {#each openRouterSummary.unsupported as k (k)}
                  <Badge variant="outline" class="px-2 py-0 text-[11px] font-medium">
                    {labelForKey(k)}
                  </Badge>
                {/each}
                {#each openRouterSummary.unknown as k (k)}
                  <Badge variant="outline" class="px-2 py-0 text-[11px] font-medium opacity-70">
                    {labelForKey(k)}
                  </Badge>
                {/each}
              </div>
            </div>

            <div class="space-y-2">
              <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Not sent</div>
              <div class="flex flex-wrap gap-2">
                {#each openRouterSummary.notSent as k (k)}
                  <Badge variant="secondary" class="px-2 py-0 text-[11px] font-medium opacity-70">
                    {labelForKey(k)}
                  </Badge>
                {/each}
              </div>
            </div>
          </div>
        </div>
      {/if}
    </CardContent>
  </Card>
{/if}
