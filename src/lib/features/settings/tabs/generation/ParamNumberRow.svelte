<script lang="ts">
  import type { OpenRouterParamStatus } from "@/features/settings/lib/openrouterParams"

  export let label: string
  export let sub: string
  export let value: unknown
  export let min: number | undefined = undefined
  export let max: number | undefined = undefined
  export let step: number | undefined = undefined
  export let status: OpenRouterParamStatus
  export let badge: { label: string; kind: "warning" | "neutral" } | null = null
  export let badgeTitle = ""
  export let onChange: (e: Event) => void
  let inputValue: string | number = ""
  $: inputValue = typeof value === "number" || typeof value === "string" ? value : value == null ? "" : String(value)
</script>

<label class="control-row control-row--input" class:param-ignored={status === "unsupported" || status === "not_sent"}>
  <span class="control-row-text">
    <span class="control-row-title">
      {label}
      {#if badge}
        <span class="badge" class:badge--warning={badge.kind === "warning"} title={badgeTitle}>{badge.label}</span>
      {/if}
    </span>
    <span class="control-row-sub">{sub}</span>
  </span>
  <input class="num-input" type="number" value={inputValue} {min} {max} {step} onchange={onChange} />
</label>
