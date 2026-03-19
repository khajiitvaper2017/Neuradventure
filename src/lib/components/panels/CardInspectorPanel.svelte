<script lang="ts">
  import { showError, showQuietNotice } from "@/stores/ui"
  import { cn } from "@/utils.js"
  import * as Avatar from "@/components/ui/avatar"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Checkbox } from "@/components/ui/checkbox"
  import { Sheet, SheetContent } from "@/components/ui/sheet"
  import { ScrollArea } from "@/components/ui/scroll-area"

  type Props = {
    open?: boolean
    title?: string
    loading?: boolean
    error?: string | null
    card?: unknown | null
    avatarDataUrl?: string | null
    onClose?: (() => void) | null
  }

  let {
    open = false,
    title = "Card Inspector",
    loading = false,
    error = null,
    card = null,
    avatarDataUrl = null,
    onClose = null,
  }: Props = $props()

  type AnyRecord = Record<string, unknown>

  let tab = $state<"fields" | "raw">("fields")
  let showEmpty = $state(false)

  function asRecord(value: unknown): AnyRecord | null {
    return value && typeof value === "object" ? (value as AnyRecord) : null
  }

  function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
  }

  function asString(value: unknown): string {
    return typeof value === "string" ? value : ""
  }

  function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.filter((v): v is string => typeof v === "string")
  }

  function prettyJson(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return ""
    }
  }

  async function writeClipboard(text: string): Promise<void> {
    if (!text) return
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
    const el = document.createElement("textarea")
    el.value = text
    el.style.position = "fixed"
    el.style.left = "-9999px"
    document.body.appendChild(el)
    el.focus()
    el.select()
    document.execCommand("copy")
    document.body.removeChild(el)
  }

  async function copyField(label: string, value: string) {
    const text = value.trim()
    if (!text) return
    try {
      await writeClipboard(text)
      showQuietNotice(`${label} copied`)
    } catch {
      showError("Copy failed")
    }
  }

  function exampleDialogsFromData(data: AnyRecord): string {
    const direct = asString(data.mes_example).trim()
    return direct
  }

  const cardObj = $derived(asRecord(card))
  const cardData = $derived(cardObj ? asRecord(cardObj.data) : null)
  const spec = $derived(cardObj ? asString(cardObj.spec).trim() : "")
  const specVersion = $derived(cardObj ? asString(cardObj.spec_version).trim() : "")
  const name = $derived(cardData ? asString(cardData.name).trim() : "")
  const creator = $derived(cardData ? asString(cardData.creator).trim() : "")
  const characterVersion = $derived(cardData ? asString(cardData.character_version).trim() : "")
  const tags = $derived(
    cardData
      ? asStringArray(cardData.tags)
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
  )
  const systemPrompt = $derived(cardData ? asString(cardData.system_prompt) : "")
  const creatorNotes = $derived(cardData ? asString(cardData.creator_notes) : "")
  const postHistory = $derived(cardData ? asString(cardData.post_history_instructions) : "")
  const firstMes = $derived(cardData ? asString(cardData.first_mes) : "")
  const altGreetings = $derived(
    cardData
      ? asStringArray(cardData.alternate_greetings)
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
  )
  const exampleDialogs = $derived(cardData ? exampleDialogsFromData(cardData) : "")
  const characterBook = $derived(cardData ? asRecord(cardData.character_book) : null)
  const characterBookEntryList = $derived(
    characterBook
      ? asArray((characterBook as AnyRecord).entries)
          .map((v) => asRecord(v))
          .filter((v): v is AnyRecord => !!v)
      : [],
  )
  const characterBookEntries = $derived(characterBookEntryList.length)
  const rawJson = $derived(prettyJson(card))
  const avatarSrc = $derived((avatarDataUrl ?? "").trim())

  function close() {
    onClose?.()
  }
</script>

{#snippet KV(label, value)}
  <div class="rounded-lg border bg-card p-3">
    <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
    <div class="mt-1 text-sm text-foreground">{value}</div>
  </div>
{/snippet}

{#snippet CodeBox(title, copyLabel, body)}
  {@const trimmed = String(body ?? "").trim()}
  <div class="rounded-lg border bg-card">
    <div class="flex items-center justify-between gap-3 border-b px-3 py-2">
      <div class="min-w-0 truncate text-sm font-medium text-foreground">{title}</div>
      <Button
        size="sm"
        variant="outline"
        class="h-8"
        onclick={() => copyField(copyLabel, String(body ?? ""))}
        disabled={!trimmed}
      >
        Copy
      </Button>
    </div>
    <pre
      class={cn(
        "px-3 py-2 text-xs leading-relaxed",
        "whitespace-pre-wrap break-words font-mono",
        !trimmed && "text-muted-foreground italic",
      )}>
{trimmed || "(empty)"}</pre>
  </div>
{/snippet}

<Sheet
  {open}
  onOpenChange={(next) => {
    if (!next && open) close()
  }}
>
  <SheetContent side="right" class="w-[min(92vw,44rem)] sm:max-w-none p-0">
    <div class="flex items-center justify-between gap-3 border-b px-4 py-3">
      <div class="min-w-0 truncate text-sm font-semibold text-foreground">{title}</div>
    </div>

    <ScrollArea class="max-h-[calc(100dvh-3.25rem)]">
      <div class="p-4">
        {#if loading}
          <div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Fetching card metadata…</div>
        {:else if error}
          <div class="rounded-lg border bg-card p-4 text-sm text-destructive">{error}</div>
        {:else if cardData}
          <div class="space-y-4">
            <div class="flex items-center gap-3 rounded-lg border bg-card p-3">
              {#if avatarSrc}
                <Avatar.Root class="size-12 shrink-0 border bg-muted shadow-sm">
                  <Avatar.Image src={avatarSrc} alt="Character avatar" class="object-cover" />
                </Avatar.Root>
              {/if}
              <div class="min-w-0">
                <div class="truncate text-base font-semibold text-foreground">{name || "Unknown Character"}</div>
                <div class="mt-0.5 text-xs text-muted-foreground">
                  {spec || "tavern card"}{specVersion ? ` · v${specVersion}` : ""}{creator
                    ? ` · by ${creator}`
                    : ""}{characterVersion ? ` · ${characterVersion}` : ""}
                </div>
              </div>
            </div>

            {#if tags.length}
              <div class="flex flex-wrap gap-2">
                {#each tags as tag (tag)}
                  <Badge variant="secondary" class="rounded-full font-mono text-[11px]">{tag}</Badge>
                {/each}
              </div>
            {/if}

            <div class="flex flex-wrap items-center gap-2">
              <div class="mr-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">View</div>
              <Button
                variant={tab === "fields" ? "secondary" : "outline"}
                size="sm"
                class="h-8"
                onclick={() => (tab = "fields")}
              >
                Fields
              </Button>
              <Button
                variant={tab === "raw" ? "secondary" : "outline"}
                size="sm"
                class="h-8"
                onclick={() => (tab = "raw")}
              >
                Raw JSON
              </Button>
              <div
                class="ml-auto inline-flex items-center gap-2 text-sm text-muted-foreground"
                title="Show empty fields too"
              >
                <Checkbox checked={showEmpty} onCheckedChange={(v) => (showEmpty = v)} />
                <span>Show empty</span>
              </div>
            </div>

            {#if tab === "fields"}
              {#if showEmpty || spec || specVersion}
                <div class="grid gap-3 sm:grid-cols-2">
                  {@render KV("Spec", spec || "(missing)")}
                  {@render KV("Spec Version", specVersion || "(missing)")}
                </div>
              {/if}

              {#if showEmpty || creator || characterVersion}
                <div class="grid gap-3 sm:grid-cols-2">
                  {@render KV("Creator", creator || "(empty)")}
                  {@render KV("Character Version", characterVersion || "(empty)")}
                </div>
              {/if}

              {#if showEmpty || firstMes.trim()}
                {@render CodeBox("First Message", "First message", firstMes)}
              {/if}

              {#if showEmpty || altGreetings.length}
                {@render CodeBox(
                  "Alternate Greetings",
                  "Alternate greetings",
                  altGreetings.length ? altGreetings.map((t, i) => `${i + 1}. ${t}`).join("\n\n") : "",
                )}
              {/if}

              {#if showEmpty || exampleDialogs.trim()}
                {@render CodeBox("Example Dialogs", "Example dialogs", exampleDialogs)}
              {/if}

              {#if showEmpty || systemPrompt.trim()}
                {@render CodeBox("System Prompt", "System prompt", systemPrompt)}
              {/if}

              {#if showEmpty || postHistory.trim()}
                {@render CodeBox("Post-History Instructions", "Post-history instructions", postHistory)}
              {/if}

              {#if showEmpty || creatorNotes.trim()}
                {@render CodeBox("Creator Notes", "Creator notes", creatorNotes)}
              {/if}

              {#if characterBook}
                <details class="rounded-lg border bg-card">
                  <summary
                    class="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <span>Character Book</span>
                    <span class="font-mono text-[11px] text-muted-foreground">{characterBookEntries} entries</span>
                  </summary>
                  <div class="space-y-3 p-3">
                    {#if characterBookEntryList.length}
                      {#each characterBookEntryList as entry, i (i)}
                        {@const entryName = asString(entry.name).trim() || `Entry ${i + 1}`}
                        {@const entryEnabled = entry.enabled !== false}
                        {@const entryKeys = asStringArray(entry.keys)
                          .map((t) => t.trim())
                          .filter(Boolean)}
                        {@const entryPosition = asString(entry.position).trim()}
                        {@const entryOrderRaw = entry.insertion_order}
                        {@const entryOrder =
                          typeof entryOrderRaw === "number" && Number.isFinite(entryOrderRaw) ? entryOrderRaw : null}
                        {@const entryContent = asString(entry.content)}

                        <details class="rounded-lg border bg-background">
                          <summary
                            class="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                          >
                            <span class="truncate">{entryName}</span>
                            <span class="font-mono text-[11px] text-muted-foreground">
                              {entryEnabled ? "enabled" : "disabled"} · {entryKeys.length} keys{entryPosition
                                ? ` · ${entryPosition}`
                                : ""}{entryOrder !== null ? ` · order ${entryOrder}` : ""}
                            </span>
                          </summary>
                          <div class="space-y-3 p-3">
                            {@render CodeBox("Keys", "Character book keys", entryKeys.join(", "))}
                            {@render CodeBox("Content", "Character book content", entryContent)}
                          </div>
                        </details>
                      {/each}
                    {/if}

                    {@render CodeBox("Character Book JSON", "Character book", prettyJson(characterBook))}
                  </div>
                </details>
              {:else if showEmpty}
                {@render KV("Character Book", "(none)")}
              {/if}
            {:else}
              {@render CodeBox("Imported Card JSON", "Card JSON", rawJson)}
            {/if}
          </div>
        {:else}
          <div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">(missing or invalid card)</div>
        {/if}
      </div>
    </ScrollArea>
  </SheetContent>
</Sheet>
