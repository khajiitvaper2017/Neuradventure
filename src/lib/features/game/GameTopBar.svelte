<script lang="ts">
  import { buildTurnMessages } from "@/llm"
  import { stories } from "@/services/stories"
  import { normalizePlayerInput } from "@/utils/text/inputNormalize"
  import { cn } from "@/utils.js"
  import { estimateChatTokens, formatTokenCount } from "@/utils/text/tokenEstimate"
  import { EllipsisVertical, User, Users } from "@lucide/svelte"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu"
  import { authorNoteEnabled, ctxLimitDetected, generation } from "@/stores/settings"
  import { collapseCharSheet, collapseCharactersPanel } from "@/stores/ui"
  import {
    character,
    currentStoryAuthorNote,
    currentStoryAuthorNoteDepth,
    currentStoryAuthorNoteEmbedState,
    currentStoryAuthorNoteInterval,
    currentStoryAuthorNotePosition,
    currentStoryAuthorNoteRole,
    currentStoryId,
    currentStoryModules,
    currentStoryTitle,
    llmUpdateId,
    npcs,
    turns,
    worldState,
  } from "@/stores/game"

  type ActionMode = "do" | "say" | "story"

  type Props = {
    flashLocation?: boolean
    input?: string
    actionMode?: ActionMode
    onGoHome?: () => void
    onOpenWorldFieldsEditor?: () => void
    onOpenAuthorNoteEditor?: () => void
    onOpenModulesEditor?: () => void
  }

  let {
    flashLocation = false,
    input = "",
    actionMode = "do",
    onGoHome,
    onOpenWorldFieldsEditor,
    onOpenAuthorNoteEditor,
    onOpenModulesEditor,
  }: Props = $props()

  let showMenu = $state(false)
  const trackNpcs = $derived($currentStoryModules?.track_npcs ?? true)
  const approxPromptTokens = $derived.by(() => {
    void $llmUpdateId
    if (!$character || !$worldState) return 0

    const trimmedInput = input.trim()
    const playerInput = trimmedInput ? normalizePlayerInput(trimmedInput, actionMode) : ""
    const effectiveActionMode: ActionMode = playerInput ? actionMode : "story"
    const ctxLimit = $generation.ctx_limit > 0 ? $generation.ctx_limit : $ctxLimitDetected

    const messages = buildTurnMessages(
      $character,
      $worldState,
      $npcs,
      $turns,
      playerInput,
      effectiveActionMode,
      undefined,
      ctxLimit,
      {
        text: $currentStoryAuthorNote,
        depth: $currentStoryAuthorNoteDepth,
        position: $currentStoryAuthorNotePosition,
        interval: $currentStoryAuthorNoteInterval,
        role: $currentStoryAuthorNoteRole,
        embedState: $currentStoryAuthorNoteEmbedState,
        enabled: $authorNoteEnabled,
      },
      $currentStoryModules ?? undefined,
    )

    return estimateChatTokens(messages)
  })

  async function exportStory(format: "neuradventure" | "tavern" | "plaintext") {
    showMenu = false
    if (!$currentStoryId) return
    try {
      await stories.exportAndDownload($currentStoryId, format)
    } catch (err) {
      console.error("[export] Failed to export story", err)
    }
  }
</script>

<header class="flex min-h-12 items-center gap-2 border-b pr-2 min-[1200px]:pr-6">
  <Button
    variant="ghost"
    size="icon"
    class="h-12 w-12 shrink-0 rounded-none border-r text-muted-foreground hover:bg-accent hover:text-foreground"
    onclick={onGoHome}
    title="Return to menu"
    aria-label="Back to stories"
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg
    >
  </Button>

  <div class="flex min-w-0 flex-1 flex-col gap-0.5 py-2">
    <span class="break-words text-sm font-medium leading-snug text-foreground">{$currentStoryTitle}</span>
    {#if $worldState}
      <span
        class={cn(
          "break-words text-[11px] uppercase tracking-wider text-muted-foreground/80",
          flashLocation && "animate-pulse",
        )}
      >
        {$worldState.current_location} · {$worldState.time_of_day}
      </span>
    {/if}
  </div>

  <div class="flex shrink-0 items-center gap-1">
    <Badge
      variant="secondary"
      class="mr-1 font-mono text-xs tabular-nums"
      title={`Approx prompt tokens from the current turn builder: ~${approxPromptTokens} · Max completion: ≤${$generation.max_tokens}`}
    >
      ~{formatTokenCount(approxPromptTokens)}
    </Badge>

    <Button
      variant="ghost"
      size="icon"
      class={cn("hidden h-9 w-9 text-muted-foreground min-[1200px]:inline-flex", $collapseCharSheet && "opacity-50")}
      title={$collapseCharSheet ? "Show player" : "Hide player"}
      onclick={() => collapseCharSheet.update((v) => !v)}
    >
      <User size={15} strokeWidth={1.8} aria-hidden="true" />
    </Button>

    {#if trackNpcs}
      <Button
        variant="ghost"
        size="icon"
        class={cn(
          "hidden h-9 w-9 text-muted-foreground min-[1200px]:inline-flex",
          $collapseCharactersPanel && "opacity-50",
        )}
        title={$collapseCharactersPanel ? "Show characters" : "Hide characters"}
        onclick={() => collapseCharactersPanel.update((v) => !v)}
      >
        <Users size={15} strokeWidth={1.8} aria-hidden="true" />
      </Button>
    {/if}

    <DropdownMenu open={showMenu} onOpenChange={(next) => (showMenu = next)}>
      <DropdownMenuTrigger
        class="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <span class="sr-only">More options</span>
        <EllipsisVertical size={15} strokeWidth={1.8} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-48">
        <DropdownMenuItem onSelect={() => onOpenWorldFieldsEditor?.()}>World Fields</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpenAuthorNoteEditor?.()}>Author's Note</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpenModulesEditor?.()}>Story Modules</DropdownMenuItem>
        {#if $currentStoryId}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void exportStory("neuradventure")}>Export JSON</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportStory("tavern")}>Export ST Chat</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportStory("plaintext")}>Export Text</DropdownMenuItem>
        {/if}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</header>
