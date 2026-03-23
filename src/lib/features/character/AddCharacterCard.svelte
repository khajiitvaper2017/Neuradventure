<script lang="ts">
  import { cn } from "@/utils.js"
  import { Button } from "@/components/ui/button"
  import * as Card from "@/components/ui/card"
  import { Input } from "@/components/ui/input"
  import { Plus } from "@lucide/svelte"

  type Props = {
    value?: string
    disabled?: boolean
    busy?: boolean
    placeholder?: string
    onInput?: (next: string) => void
    onAdd?: () => void
  }

  let { value = "", disabled = false, busy = false, placeholder = "Add character...", onInput, onAdd }: Props = $props()
</script>

<Card.Root class="shadow-sm p-0 py-0 gap-0">
  <Card.Content class="p-3">
    <div class="flex items-center gap-2">
      <div
        class={cn(
          "grid h-9 w-9 place-items-center rounded-lg border bg-muted/30 text-muted-foreground",
          disabled && "opacity-60",
        )}
        aria-hidden="true"
      >
        <Plus size={16} strokeWidth={2} />
      </div>

      <Input
        type="text"
        {placeholder}
        {value}
        disabled={disabled || busy}
        oninput={(e) => onInput?.((e.target as HTMLInputElement).value)}
        onkeydown={(e) => {
          if (e.key === "Enter") onAdd?.()
        }}
      />

      <Button onclick={onAdd} disabled={disabled || busy || !value.trim()}>
        {busy ? "Adding..." : "Add"}
      </Button>
    </div>
  </Card.Content>
</Card.Root>
