<script lang="ts">
  import type { GenerationParams, ModelInfo } from "@/shared/api-types"
  import { connector, generation } from "@/stores/settings"
  import {
    dynatempParams,
    dryParams,
    mirostatParams,
    otherParams,
    repetitionParams,
    samplingParams,
    xtcParams,
  } from "@/features/settings/lib/generationParamDefs"
  import ParamNumberRow from "@/features/settings/tabs/generation/ParamNumberRow.svelte"
  import OpenRouterParamNotice from "@/features/settings/tabs/generation/OpenRouterParamNotice.svelte"
  import { Separator } from "@/components/ui/separator"
  import {
    badgeForStatus,
    paramStatus,
    titleForStatus,
  } from "@/features/settings/tabs/generation/openRouterParamSupport"

  type Props = {
    modelSearchResults?: ModelInfo[]
  }

  let { modelSearchResults = [] }: Props = $props()

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

<OpenRouterParamNotice {modelSearchResults} />

<div class="pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sampling</div>
{#each samplingParams as p (p.key)}
  {@const status = paramStatus(p.key, $connector, modelSearchResults)}
  {@const badge = badgeForStatus(status)}
  <ParamNumberRow
    label={p.label}
    sub={p.sub}
    value={$generation[p.key]}
    min={p.min}
    max={p.max}
    step={p.step}
    {status}
    {badge}
    badgeTitle={titleForStatus(status)}
    onChange={(e: Event) => handleNumInput(p.key, e, p.int)}
  />
{/each}

<Separator class="my-4" />

<div class="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Repetition Penalties</div>
{#each repetitionParams as p (p.key)}
  {@const status = paramStatus(p.key, $connector, modelSearchResults)}
  {@const badge = badgeForStatus(status)}
  <ParamNumberRow
    label={p.label}
    sub={p.sub}
    value={$generation[p.key]}
    min={p.min}
    max={p.max}
    step={p.step}
    {status}
    {badge}
    badgeTitle={titleForStatus(status)}
    onChange={(e: Event) => handleNumInput(p.key, e, p.int)}
  />
{/each}

<Separator class="my-4" />

<div class="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
  DRY (Diverse Repetition Penalty)
</div>
{#each dryParams as p (p.key)}
  {@const status = paramStatus(p.key, $connector, modelSearchResults)}
  {@const badge = badgeForStatus(status)}
  <ParamNumberRow
    label={p.label}
    sub={p.sub}
    value={$generation[p.key]}
    min={p.min}
    max={p.max}
    step={p.step}
    {status}
    {badge}
    badgeTitle={titleForStatus(status)}
    onChange={(e: Event) => handleNumInput(p.key, e, p.int)}
  />
{/each}

<Separator class="my-4" />

<div class="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mirostat</div>
{#each mirostatParams as p (p.key)}
  {@const status = paramStatus(p.key, $connector, modelSearchResults)}
  {@const badge = badgeForStatus(status)}
  <ParamNumberRow
    label={p.label}
    sub={p.sub}
    value={$generation[p.key]}
    min={p.min}
    max={p.max}
    step={p.step}
    {status}
    {badge}
    badgeTitle={titleForStatus(status)}
    onChange={(e: Event) => handleNumInput(p.key, e, p.int)}
  />
{/each}

<Separator class="my-4" />

<div class="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dynamic Temperature</div>
{#each dynatempParams as p (p.key)}
  {@const status = paramStatus(p.key, $connector, modelSearchResults)}
  {@const badge = badgeForStatus(status)}
  <ParamNumberRow
    label={p.label}
    sub={p.sub}
    value={$generation[p.key]}
    min={p.min}
    max={p.max}
    step={p.step}
    {status}
    {badge}
    badgeTitle={titleForStatus(status)}
    onChange={(e: Event) => handleNumInput(p.key, e, p.int)}
  />
{/each}

<Separator class="my-4" />

<div class="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">XTC (Token Cutting)</div>
{#each xtcParams as p (p.key)}
  {@const status = paramStatus(p.key, $connector, modelSearchResults)}
  {@const badge = badgeForStatus(status)}
  <ParamNumberRow
    label={p.label}
    sub={p.sub}
    value={$generation[p.key]}
    min={p.min}
    max={p.max}
    step={p.step}
    {status}
    {badge}
    badgeTitle={titleForStatus(status)}
    onChange={(e: Event) => handleNumInput(p.key, e, p.int)}
  />
{/each}

<Separator class="my-4" />

<div class="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Other</div>
{#each otherParams.filter((p) => p.key !== "ctx_limit") as p (p.key)}
  {@const status = paramStatus(p.key, $connector, modelSearchResults)}
  {@const badge = badgeForStatus(status)}
  <ParamNumberRow
    label={p.label}
    sub={p.sub}
    value={$generation[p.key]}
    min={p.min}
    max={p.max}
    step={p.step}
    {status}
    {badge}
    badgeTitle={titleForStatus(status)}
    onChange={(e: Event) => handleNumInput(p.key, e, p.int)}
  />
{/each}

<div class="h-10"></div>
