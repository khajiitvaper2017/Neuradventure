<script lang="ts">
  import { Button } from "@/components/ui/button"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"

  type Props = {
    title: string
    description?: string
    inputId: string
    inputLabel: string
    placeholder?: string
    items?: string[]
    disabled?: boolean
  }

  let {
    title,
    description,
    inputId,
    inputLabel,
    placeholder = "",
    items = $bindable<string[]>([]),
    disabled = false,
  }: Props = $props()

  let draft = $state("")

  function add() {
    const trimmed = draft.trim()
    if (!trimmed) return
    if (!items.includes(trimmed)) items = [...items, trimmed]
    draft = ""
  }

  function remove(value: string) {
    items = items.filter((x) => x !== value)
  }
</script>

<Card>
  <CardHeader class="space-y-1">
    <CardTitle class="text-base">{title}</CardTitle>
    {#if description}
      <CardDescription>{description}</CardDescription>
    {/if}
  </CardHeader>
  <CardContent class="space-y-3">
    <div class="flex flex-col gap-2 sm:flex-row">
      <Label for={inputId} class="sr-only">{inputLabel}</Label>
      <Input
        id={inputId}
        type="text"
        bind:value={draft}
        {placeholder}
        onkeydown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            add()
          }
        }}
        {disabled}
      />
      <Button variant="outline" onclick={add} disabled={disabled || !draft.trim()}>+ Add</Button>
    </div>

    {#if items.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each items as t (t)}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            class="h-8 rounded-full px-3 text-xs"
            onclick={() => remove(t)}
            {disabled}
          >
            {t} <span class="text-foreground/60">×</span>
          </Button>
        {/each}
      </div>
    {/if}
  </CardContent>
</Card>
