<script lang="ts">
  import * as Select from "@/components/ui/select"
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog"
  import { Button } from "@/components/ui/button"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"
  import { Textarea } from "@/components/ui/textarea"
  import { Checkbox } from "@/components/ui/checkbox"

  type Props = {
    open?: boolean
    disabled?: boolean
    note?: string
    position?: number
    depth?: number
    interval?: number
    role?: number
    embedState?: boolean
    onCancel?: () => void
    onSave?: () => void
  }

  let {
    open = false,
    disabled = false,
    note = $bindable(""),
    position = $bindable(1),
    depth = $bindable(4),
    interval = $bindable(1),
    role = $bindable(0),
    embedState = $bindable(false),
    onCancel,
    onSave,
  }: Props = $props()

  const positionOptions = [
    { value: 2, label: "Before scenario" },
    { value: 1, label: "In chat" },
    { value: 0, label: "After scenario" },
  ]

  const roleOptions = [
    { value: 0, label: "System" },
    { value: 1, label: "User" },
    { value: 2, label: "Assistant" },
  ]

  const positionSelectOptions = positionOptions.map((o) => ({ value: String(o.value), label: o.label }))
  const roleSelectOptions = roleOptions.map((o) => ({ value: String(o.value), label: o.label }))

  const positionLabel = $derived(positionSelectOptions.find((o) => o.value === String(position))?.label ?? "Select…")
  const roleLabel = $derived(roleSelectOptions.find((o) => o.value === String(role))?.label ?? "Select…")
</script>

<Dialog
  {open}
  onOpenChange={(next) => {
    if (!next && open) onCancel?.()
  }}
>
  <DialogContent class="max-w-3xl">
    <DialogHeader>
      <DialogTitle>Author's Note</DialogTitle>
      <DialogDescription>Injected into the prompt using SillyTavern-style position/depth rules.</DialogDescription>
    </DialogHeader>

    <div class="space-y-2">
      <Label for="an-note">Note</Label>
      <Textarea
        id="an-note"
        bind:value={note}
        rows={4}
        placeholder="e.g. Focus on dialogue and character emotions"
        {disabled}
      ></Textarea>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2" role="group" aria-label="Author's note injection settings">
      <div class="space-y-2">
        <Label for="an-position">Position</Label>
        <Select.Root
          type="single"
          value={String(position)}
          onValueChange={(next) => (position = Number(next))}
          items={positionSelectOptions}
          {disabled}
        >
          <Select.Trigger id="an-position" class="w-full" aria-label="Author note position">
            {positionLabel}
          </Select.Trigger>
          <Select.Content>
            {#each positionSelectOptions as option (option.value)}
              <Select.Item {...option} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="space-y-2">
        <Label for="an-depth">Depth</Label>
        <Input id="an-depth" type="number" min="0" max="100" bind:value={depth} {disabled} />
      </div>

      <div class="space-y-2">
        <Label for="an-interval">Interval</Label>
        <Input id="an-interval" type="number" min="0" max="1000" bind:value={interval} {disabled} />
        <div class="text-xs text-muted-foreground">0 disables author note text injection.</div>
      </div>

      <div class="space-y-2">
        <Label for="an-role">Role</Label>
        <Select.Root
          type="single"
          value={String(role)}
          onValueChange={(next) => (role = Number(next))}
          items={roleSelectOptions}
          {disabled}
        >
          <Select.Trigger id="an-role" class="w-full" aria-label="Author note role">
            {roleLabel}
          </Select.Trigger>
          <Select.Content>
            {#each roleSelectOptions as option (option.value)}
              <Select.Item {...option} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="space-y-2 border-t pt-4 sm:col-span-2">
        <div class="flex items-center justify-between gap-3">
          <Label for="an-embed">Embed state blocks</Label>
          <Checkbox id="an-embed" bind:checked={embedState} {disabled} />
        </div>
        <div class="text-xs text-muted-foreground">
          If enabled, state blocks (player/npc context) are placed inside the author note section.
        </div>
      </div>
    </div>

    <DialogFooter class="mt-2">
      <Button variant="outline" onclick={() => onCancel?.()} {disabled}>Cancel</Button>
      <Button onclick={() => onSave?.()} {disabled}>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
