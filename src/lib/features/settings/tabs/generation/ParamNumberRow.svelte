<script lang="ts">
  import type { OpenRouterParamStatus } from "@/features/settings/lib/openrouterParams"
  import { cn } from "@/utils.js"
  import { Badge } from "@/components/ui/badge"
  import { Input } from "@/components/ui/input"

  type Props = {
    label: string
    sub: string
    value: unknown
    min?: number
    max?: number
    step?: number
    status: OpenRouterParamStatus
    badge?: { label: string; kind: "warning" | "neutral" } | null
    badgeTitle?: string
    onChange: (e: Event) => void
  }

  let { label, sub, value, min, max, step, status, badge = null, badgeTitle = "", onChange }: Props = $props()

  const inputValue = $derived(
    typeof value === "number" || typeof value === "string" ? value : value == null ? "" : String(value),
  )
  const ignored = $derived(status === "unsupported" || status === "not_sent")
</script>

<div class={cn("flex items-start justify-between gap-4 border-b py-3", ignored && "opacity-60")}>
  <div class="min-w-0 flex-1 space-y-1">
    <div class="flex flex-wrap items-center gap-2">
      <div class="text-sm font-medium text-foreground">{label}</div>
      {#if badge}
        <Badge
          variant="outline"
          class={cn(
            "font-mono text-[11px]",
            badge.kind === "warning" && "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
          )}
          title={badgeTitle}
        >
          {badge.label}
        </Badge>
      {/if}
    </div>
    <div class="text-xs text-muted-foreground">{sub}</div>
  </div>
  <div class="w-28">
    <Input
      class={cn(ignored && "line-through decoration-muted-foreground")}
      type="number"
      value={inputValue}
      {min}
      {max}
      {step}
      onchange={onChange}
    />
  </div>
</div>
