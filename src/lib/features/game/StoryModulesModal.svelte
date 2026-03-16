<script lang="ts">
  import type { StoryModules } from "@/shared/types"
  import StoryModulesPanel from "@/components/panels/StoryModulesPanel.svelte"
  import { Button } from "@/components/ui/button"
  import { Sheet, SheetContent } from "@/components/ui/sheet"
  import { ScrollArea } from "@/components/ui/scroll-area"

  type Props = {
    open?: boolean
    disabled?: boolean
    modules: StoryModules
    onCancel?: () => void
    onSave?: () => void
  }

  let { open = false, disabled = false, modules = $bindable(), onCancel, onSave }: Props = $props()
</script>

<Sheet
  {open}
  onOpenChange={(next) => {
    if (!next && open) onCancel?.()
  }}
>
  <SheetContent side="right" class="w-[min(92vw,44rem)] sm:max-w-none p-0">
    <div class="flex items-center justify-between gap-3 border-b px-4 py-3">
      <div class="min-w-0">
        <div class="truncate text-sm font-semibold text-foreground">Story Modules</div>
        <div class="mt-0.5 text-xs text-muted-foreground">Control which mechanics are tracked for this story.</div>
      </div>
      <Button variant="ghost" size="icon" class="h-9 w-9" onclick={onCancel} aria-label="Close">×</Button>
    </div>

    <ScrollArea class="max-h-[calc(100dvh-7.25rem)]">
      <div class="p-4">
        <StoryModulesPanel {modules} setModules={(next) => (modules = next)} bare />
      </div>
    </ScrollArea>
    <div class="flex items-center justify-end gap-2 border-t px-4 py-3">
      <Button variant="outline" onclick={onCancel} {disabled}>Cancel</Button>
      <Button onclick={onSave} {disabled}>Save</Button>
    </div>
  </SheetContent>
</Sheet>
