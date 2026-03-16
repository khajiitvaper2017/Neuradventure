<script lang="ts">
  import type { GenerationParams, ModelInfo } from "@/shared/api-types"
  import { connector, generation } from "@/stores/settings"
  import { SvelteMap } from "svelte/reactivity"
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
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import {
    badgeForStatus,
    paramStatus,
    titleForStatus,
  } from "@/features/settings/tabs/generation/openRouterParamSupport"
  import { SlidersVertical } from "@lucide/svelte"

  type Props = {
    modelSearchResults?: ModelInfo[]
  }

  let { modelSearchResults = [] }: Props = $props()

  const paramKeys = [
    ...new Set(
      [
        ...samplingParams,
        ...repetitionParams,
        ...dryParams,
        ...mirostatParams,
        ...dynatempParams,
        ...xtcParams,
        ...otherParams,
      ].map((p) => p.key),
    ),
  ] as Array<keyof GenerationParams>

  let statusByKey = $derived.by(() => {
    const map = new SvelteMap<keyof GenerationParams, ReturnType<typeof paramStatus>>()
    for (const k of paramKeys) map.set(k, paramStatus(k, $connector, modelSearchResults))
    return map
  })

  const statusFor = (key: keyof GenerationParams) =>
    statusByKey.get(key) ?? paramStatus(key, $connector, modelSearchResults)

  const isKoboldOnly = (key: keyof GenerationParams) =>
    $connector.type === "openrouter" && statusFor(key) === "not_sent"

  const splitParams = <T extends { key: keyof GenerationParams }>(list: T[]) => {
    const main: T[] = []
    const koboldOnly: T[] = []
    for (const p of list) {
      if (isKoboldOnly(p.key)) koboldOnly.push(p)
      else main.push(p)
    }
    return { main, koboldOnly }
  }

  let samplingSplit = $derived.by(() => splitParams(samplingParams))
  let repetitionSplit = $derived.by(() => splitParams(repetitionParams))
  let drySplit = $derived.by(() => splitParams(dryParams))
  let mirostatSplit = $derived.by(() => splitParams(mirostatParams))
  let dynatempSplit = $derived.by(() => splitParams(dynatempParams))
  let xtcSplit = $derived.by(() => splitParams(xtcParams))
  let otherSplit = $derived.by(() => splitParams(otherParams.filter((p) => p.key !== "ctx_limit")))

  let hasKoboldOnly = $derived(
    samplingSplit.koboldOnly.length > 0 ||
      repetitionSplit.koboldOnly.length > 0 ||
      drySplit.koboldOnly.length > 0 ||
      mirostatSplit.koboldOnly.length > 0 ||
      dynatempSplit.koboldOnly.length > 0 ||
      xtcSplit.koboldOnly.length > 0 ||
      otherSplit.koboldOnly.length > 0,
  )

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

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <SlidersVertical class="size-4 text-muted-foreground" aria-hidden="true" />
      Params
    </CardTitle>
    <CardDescription>Sampling and repetition settings sent to the backend.</CardDescription>
  </CardHeader>

  <CardContent class="pb-6">
    <div class="divide-y divide-border overflow-hidden rounded-md border bg-card/50">
      {#if samplingSplit.main.length > 0}
        <div class="p-4">
          <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sampling</div>
          <div class="mt-3">
            {#each samplingSplit.main as p (p.key)}
              {@const status = statusFor(p.key)}
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
          </div>
        </div>
      {/if}

      {#if repetitionSplit.main.length > 0}
        <div class="p-4">
          <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Repetition Penalties</div>
          <div class="mt-3">
            {#each repetitionSplit.main as p (p.key)}
              {@const status = statusFor(p.key)}
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
          </div>
        </div>
      {/if}

      {#if drySplit.main.length > 0}
        <div class="p-4">
          <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            DRY (Diverse Repetition Penalty)
          </div>
          <div class="mt-3">
            {#each drySplit.main as p (p.key)}
              {@const status = statusFor(p.key)}
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
          </div>
        </div>
      {/if}

      {#if mirostatSplit.main.length > 0}
        <div class="p-4">
          <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mirostat</div>
          <div class="mt-3">
            {#each mirostatSplit.main as p (p.key)}
              {@const status = statusFor(p.key)}
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
          </div>
        </div>
      {/if}

      {#if dynatempSplit.main.length > 0}
        <div class="p-4">
          <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dynamic Temperature</div>
          <div class="mt-3">
            {#each dynatempSplit.main as p (p.key)}
              {@const status = statusFor(p.key)}
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
          </div>
        </div>
      {/if}

      {#if xtcSplit.main.length > 0}
        <div class="p-4">
          <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">XTC (Token Cutting)</div>
          <div class="mt-3">
            {#each xtcSplit.main as p (p.key)}
              {@const status = statusFor(p.key)}
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
          </div>
        </div>
      {/if}

      {#if otherSplit.main.length > 0}
        <div class="p-4">
          <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Other</div>
          <div class="mt-3">
            {#each otherSplit.main as p (p.key)}
              {@const status = statusFor(p.key)}
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
          </div>
        </div>
      {/if}

      {#if hasKoboldOnly}
        <div class="p-4">
          <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kobold-only</div>
          <div class="mt-1 text-xs text-muted-foreground">Not sent to OpenRouter.</div>

          <div class="mt-4 space-y-4">
            {#if samplingSplit.koboldOnly.length > 0}
              <div>
                <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sampling</div>
                <div class="mt-2">
                  {#each samplingSplit.koboldOnly as p (p.key)}
                    {@const status = statusFor(p.key)}
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
                </div>
              </div>
            {/if}

            {#if repetitionSplit.koboldOnly.length > 0}
              <div>
                <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Repetition Penalties
                </div>
                <div class="mt-2">
                  {#each repetitionSplit.koboldOnly as p (p.key)}
                    {@const status = statusFor(p.key)}
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
                </div>
              </div>
            {/if}

            {#if drySplit.koboldOnly.length > 0}
              <div>
                <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  DRY (Diverse Repetition Penalty)
                </div>
                <div class="mt-2">
                  {#each drySplit.koboldOnly as p (p.key)}
                    {@const status = statusFor(p.key)}
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
                </div>
              </div>
            {/if}

            {#if mirostatSplit.koboldOnly.length > 0}
              <div>
                <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mirostat</div>
                <div class="mt-2">
                  {#each mirostatSplit.koboldOnly as p (p.key)}
                    {@const status = statusFor(p.key)}
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
                </div>
              </div>
            {/if}

            {#if dynatempSplit.koboldOnly.length > 0}
              <div>
                <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Dynamic Temperature
                </div>
                <div class="mt-2">
                  {#each dynatempSplit.koboldOnly as p (p.key)}
                    {@const status = statusFor(p.key)}
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
                </div>
              </div>
            {/if}

            {#if xtcSplit.koboldOnly.length > 0}
              <div>
                <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  XTC (Token Cutting)
                </div>
                <div class="mt-2">
                  {#each xtcSplit.koboldOnly as p (p.key)}
                    {@const status = statusFor(p.key)}
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
                </div>
              </div>
            {/if}

            {#if otherSplit.koboldOnly.length > 0}
              <div>
                <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Other</div>
                <div class="mt-2">
                  {#each otherSplit.koboldOnly as p (p.key)}
                    {@const status = statusFor(p.key)}
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
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </CardContent>
</Card>
