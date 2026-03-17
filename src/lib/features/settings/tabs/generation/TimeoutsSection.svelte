<script lang="ts">
  import type { TimeoutSettings } from "@/types/api"
  import { DEFAULT_TIMEOUTS, timeouts } from "@/stores/settings"
  import { Button } from "@/components/ui/button"
  import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"
  import { Clock } from "@lucide/svelte"

  type Props = {
    disabled?: boolean
  }

  let { disabled = false }: Props = $props()

  let draftSeconds = $derived(String(Math.round($timeouts.llmRequestMs / 1000)))

  function parseIntDraft(value: string): number | null {
    const trimmed = value.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    if (!Number.isFinite(n)) return null
    return Math.trunc(n)
  }

  function clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.trunc(value)))
  }

  function blurOnEnter(e: KeyboardEvent) {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur()
  }

  function commit() {
    const parsed = parseIntDraft(draftSeconds)
    if (parsed === null) {
      draftSeconds = String(Math.round($timeouts.llmRequestMs / 1000))
      return
    }
    const clamped = clampInt(parsed, 1, 3600)
    const nextMs = clamped * 1000
    if (nextMs === $timeouts.llmRequestMs) {
      draftSeconds = String(Math.round($timeouts.llmRequestMs / 1000))
      return
    }
    timeouts.set({ llmRequestMs: nextMs } satisfies TimeoutSettings)
  }

  function resetAll() {
    if (disabled) return
    timeouts.set({ ...DEFAULT_TIMEOUTS })
  }
</script>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <Clock class="size-4 text-muted-foreground" aria-hidden="true" />
      Timeouts
    </CardTitle>
    <CardDescription>Limits for upstream network requests.</CardDescription>
    <CardAction>
      <Button size="sm" variant="outline" {disabled} onclick={resetAll} title="Reset timeout">Reset</Button>
    </CardAction>
  </CardHeader>

  <CardContent class="pb-6">
    <div class="divide-y divide-border overflow-hidden rounded-md border bg-card/50" class:opacity-60={disabled}>
      <div class="flex items-end justify-between gap-4 p-4">
        <div class="space-y-1">
          <Label for="llm-timeout-seconds">LLM request timeout (seconds)</Label>
          <div class="text-xs text-muted-foreground">How long the app waits for the model before aborting.</div>
        </div>
        <div class="w-28">
          <Input
            id="llm-timeout-seconds"
            type="number"
            min={1}
            max={3600}
            step={1}
            bind:value={draftSeconds}
            {disabled}
            onblur={commit}
            onkeydown={blurOnEnter}
          />
        </div>
      </div>
    </div>
  </CardContent>
</Card>
