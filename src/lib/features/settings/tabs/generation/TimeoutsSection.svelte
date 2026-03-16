<script lang="ts">
  import type { TimeoutSettings } from "@/shared/api-types"
  import { DEFAULT_TIMEOUTS, timeouts } from "@/stores/settings"
  import { Button } from "@/components/ui/button"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"

  type Props = {
    disabled?: boolean
  }

  let { disabled = false }: Props = $props()

  let draftSeconds = $state(String(Math.round($timeouts.llmRequestMs / 1000)))

  $effect(() => {
    draftSeconds = String(Math.round($timeouts.llmRequestMs / 1000))
  })

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

<div class="space-y-3 pt-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeout</div>
    <Button size="sm" variant="outline" {disabled} onclick={resetAll} title="Reset timeout">Reset</Button>
  </div>

  <div class="flex items-end justify-between gap-4">
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
