<script lang="ts">
  import type { Snippet } from "svelte"
  import IconSend from "@/components/icons/IconSend.svelte"
  import IconSpinner from "@/components/icons/IconSpinner.svelte"
  import { Button } from "@/components/ui/button"
  import { Textarea } from "@/components/ui/textarea"

  export let value = ""
  export let placeholder = ""
  export let disabled = false
  export let canSend = true
  export let sending = false
  export let onSend: (() => void) | undefined = undefined
  export let onFocus: ((event: FocusEvent) => void) | undefined = undefined
  export let textareaEl: HTMLTextAreaElement | null = null
  export let rows = 2
  export let topControls: Snippet | undefined = undefined
  export let bottomControls: Snippet | undefined = undefined

  const canSubmit = () => !disabled && canSend

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (canSubmit()) onSend?.()
    }
  }

  function handleSend() {
    if (!canSubmit()) return
    onSend?.()
  }
</script>

<div class="flex shrink-0 flex-col border-t bg-background min-[1200px]:px-5 min-[1200px]:pb-4">
  <div class="flex min-h-11 items-center gap-2 border-b px-3 py-1">
    {#if topControls}
      <div
        class="flex min-w-0 flex-1 flex-wrap items-center gap-2 [&>*]:flex [&>*]:min-w-0 [&>*]:flex-wrap [&>*]:items-center [&>*]:gap-2"
      >
        {@render topControls()}
      </div>
    {/if}
    <Button
      size="icon"
      class="ml-auto h-9 w-9 rounded-full"
      onclick={handleSend}
      disabled={!canSubmit()}
      aria-label="Send"
    >
      {#if sending}
        <IconSpinner className="animate-spin" size={16} strokeWidth={2.2} />
      {:else}
        <IconSend size={16} strokeWidth={2.2} />
      {/if}
    </Button>
  </div>

  <Textarea
    bind:ref={textareaEl}
    bind:value
    {placeholder}
    {rows}
    {disabled}
    onkeydown={handleKeydown}
    onfocus={(event) => onFocus?.(event)}
    class="min-h-0 w-full resize-none border-0 bg-transparent px-5 py-3 text-sm leading-relaxed text-foreground shadow-none placeholder:italic placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50 min-[1200px]:min-h-[68px] min-[1200px]:pb-5"
  />

  {#if bottomControls}
    <div
      class="flex items-center justify-around gap-2 border-t px-2 pb-2 pt-1 min-[1200px]:hidden [&>*]:flex [&>*]:w-full [&>*]:items-center [&>*]:justify-around [&>*]:gap-2"
    >
      {@render bottomControls()}
    </div>
  {/if}
</div>
