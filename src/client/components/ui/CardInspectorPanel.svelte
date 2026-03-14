<script lang="ts">
  import { showError, showQuietNotice } from "../../stores/ui.js"

  export let open = false
  export let title = "Card Inspector"
  export let loading = false
  export let error: string | null = null
  export let card: unknown | null = null
  export let avatarDataUrl: string | null = null
  export let onClose: (() => void) | null = null

  type AnyRecord = Record<string, unknown>

  let tab: "fields" | "raw" = "fields"
  let showEmpty = false

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
    if (direct) return direct
    const legacy =
      asString((data as AnyRecord).example_dialogue).trim() || asString((data as AnyRecord).example_dialogs).trim()
    return legacy
  }

  $: cardObj = asRecord(card)
  $: cardData = cardObj ? asRecord(cardObj.data) : null
  $: spec = cardObj ? asString(cardObj.spec).trim() : ""
  $: specVersion = cardObj ? asString(cardObj.spec_version).trim() : ""
  $: name = cardData ? asString(cardData.name).trim() : ""
  $: creator = cardData ? asString(cardData.creator).trim() : ""
  $: characterVersion = cardData ? asString(cardData.character_version).trim() : ""
  $: tags = cardData
    ? asStringArray(cardData.tags)
        .map((t) => t.trim())
        .filter(Boolean)
    : []
  $: systemPrompt = cardData ? asString(cardData.system_prompt) : ""
  $: creatorNotes = cardData ? asString(cardData.creator_notes) : ""
  $: postHistory = cardData ? asString(cardData.post_history_instructions) : ""
  $: firstMes = cardData ? asString(cardData.first_mes) : ""
  $: altGreetings = cardData
    ? asStringArray(cardData.alternate_greetings)
        .map((t) => t.trim())
        .filter(Boolean)
    : []
  $: exampleDialogs = cardData ? exampleDialogsFromData(cardData) : ""
  $: characterBook = cardData ? asRecord(cardData.character_book) : null
  $: characterBookEntryList = characterBook
    ? asArray((characterBook as AnyRecord).entries)
        .map((v) => asRecord(v))
        .filter((v): v is AnyRecord => !!v)
    : []
  $: characterBookEntries = characterBookEntryList.length
  $: rawJson = prettyJson(card)

  function close() {
    onClose?.()
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={close}></div>
  <div class="panel panel--wide" role="dialog" aria-modal="true" aria-label={title} tabindex="-1">
    <div class="panel-header">
      <span>{title}</span>
      <button class="panel-close" onclick={close} aria-label="Close">×</button>
    </div>
    <div class="panel-body inspector" data-scroll-root="modal">
      {#if loading}
        <div class="codebox">
          <div class="codebox-head">
            <div class="codebox-title">Loading</div>
          </div>
          <div class="codebox-body is-empty">Fetching card metadata…</div>
        </div>
      {:else if error}
        <div class="codebox">
          <div class="codebox-head">
            <div class="codebox-title">Unavailable</div>
          </div>
          <div class="codebox-body is-empty">{error}</div>
        </div>
      {:else if cardData}
        <div class="inspector-hero">
          {#if avatarDataUrl}
            <img class="inspector-avatar" src={avatarDataUrl} alt="Character avatar" />
          {:else}
            <div class="inspector-avatar" aria-hidden="true"></div>
          {/if}
          <div>
            <div class="inspector-title">{name || "Unknown Character"}</div>
            <div class="inspector-sub">
              {spec || "tavern card"}{specVersion ? ` · v${specVersion}` : ""}{creator
                ? ` · by ${creator}`
                : ""}{characterVersion ? ` · ${characterVersion}` : ""}
            </div>
          </div>
        </div>

        {#if tags.length}
          <div class="chips">
            {#each tags as tag}
              <span class="chip selected">{tag}</span>
            {/each}
          </div>
        {/if}

        <div class="variant-row">
          <span class="variant-label">View</span>
          <button class="variant-pill" class:active={tab === "fields"} onclick={() => (tab = "fields")}>Fields</button>
          <button class="variant-pill" class:active={tab === "raw"} onclick={() => (tab = "raw")}>Raw JSON</button>
          <label class="chip" title="Show empty fields too">
            <input type="checkbox" bind:checked={showEmpty} />
            Show empty
          </label>
        </div>

        {#if tab === "fields"}
          {#if showEmpty || spec || specVersion}
            <div class="inspector-kv">
              <div class="inspector-k">Spec</div>
              <div class="inspector-v">{spec || "(missing)"}</div>
            </div>
            <div class="inspector-kv">
              <div class="inspector-k">Spec Version</div>
              <div class="inspector-v">{specVersion || "(missing)"}</div>
            </div>
          {/if}

          {#if showEmpty || creator || characterVersion}
            <div class="inspector-kv">
              <div class="inspector-k">Creator</div>
              <div class="inspector-v">{creator || "(empty)"}</div>
            </div>
            <div class="inspector-kv">
              <div class="inspector-k">Character Version</div>
              <div class="inspector-v">{characterVersion || "(empty)"}</div>
            </div>
          {/if}

          {#if showEmpty || firstMes.trim()}
            <div class="codebox">
              <div class="codebox-head">
                <div class="codebox-title">First Message</div>
                <button
                  class="btn-ghost small"
                  onclick={() => copyField("First message", firstMes)}
                  disabled={!firstMes.trim()}
                >
                  Copy
                </button>
              </div>
              <div class="codebox-body" class:is-empty={!firstMes.trim()}>{firstMes.trim() || "(empty)"}</div>
            </div>
          {/if}

          {#if showEmpty || altGreetings.length}
            <div class="codebox">
              <div class="codebox-head">
                <div class="codebox-title">Alternate Greetings</div>
                <button
                  class="btn-ghost small"
                  onclick={() => copyField("Alternate greetings", altGreetings.join("\n\n"))}
                  disabled={altGreetings.length === 0}
                >
                  Copy
                </button>
              </div>
              <div class="codebox-body" class:is-empty={altGreetings.length === 0}>
                {altGreetings.length ? altGreetings.map((t, i) => `${i + 1}. ${t}`).join("\n\n") : "(empty)"}
              </div>
            </div>
          {/if}

          {#if showEmpty || exampleDialogs.trim()}
            <div class="codebox">
              <div class="codebox-head">
                <div class="codebox-title">Example Dialogs</div>
                <button
                  class="btn-ghost small"
                  onclick={() => copyField("Example dialogs", exampleDialogs)}
                  disabled={!exampleDialogs.trim()}
                >
                  Copy
                </button>
              </div>
              <div class="codebox-body" class:is-empty={!exampleDialogs.trim()}>
                {exampleDialogs.trim() || "(empty)"}
              </div>
            </div>
          {/if}

          {#if showEmpty || systemPrompt.trim()}
            <div class="codebox">
              <div class="codebox-head">
                <div class="codebox-title">System Prompt</div>
                <button
                  class="btn-ghost small"
                  onclick={() => copyField("System prompt", systemPrompt)}
                  disabled={!systemPrompt.trim()}
                >
                  Copy
                </button>
              </div>
              <div class="codebox-body" class:is-empty={!systemPrompt.trim()}>{systemPrompt.trim() || "(empty)"}</div>
            </div>
          {/if}

          {#if showEmpty || postHistory.trim()}
            <div class="codebox">
              <div class="codebox-head">
                <div class="codebox-title">Post-History Instructions</div>
                <button
                  class="btn-ghost small"
                  onclick={() => copyField("Post-history instructions", postHistory)}
                  disabled={!postHistory.trim()}
                >
                  Copy
                </button>
              </div>
              <div class="codebox-body" class:is-empty={!postHistory.trim()}>{postHistory.trim() || "(empty)"}</div>
            </div>
          {/if}

          {#if showEmpty || creatorNotes.trim()}
            <div class="codebox">
              <div class="codebox-head">
                <div class="codebox-title">Creator Notes</div>
                <button
                  class="btn-ghost small"
                  onclick={() => copyField("Creator notes", creatorNotes)}
                  disabled={!creatorNotes.trim()}
                >
                  Copy
                </button>
              </div>
              <div class="codebox-body" class:is-empty={!creatorNotes.trim()}>{creatorNotes.trim() || "(empty)"}</div>
            </div>
          {/if}

          {#if characterBook}
            <details class="inspector-details">
              <summary>
                <span>Character Book</span>
                <span class="details-meta">{characterBookEntries} entries</span>
              </summary>
              <div class="inspector-details-body">
                {#if characterBookEntryList.length}
                  {#each characterBookEntryList as entry, i}
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

                    <details class="inspector-details">
                      <summary>
                        <span>{entryName}</span>
                        <span class="details-meta">
                          {entryEnabled ? "enabled" : "disabled"} · {entryKeys.length} keys{entryPosition
                            ? ` · ${entryPosition}`
                            : ""}{entryOrder !== null ? ` · order ${entryOrder}` : ""}
                        </span>
                      </summary>
                      <div class="inspector-details-body">
                        <div class="codebox">
                          <div class="codebox-head">
                            <div class="codebox-title">Keys</div>
                            <button
                              class="btn-ghost small"
                              onclick={() => copyField("Character book keys", entryKeys.join(", "))}
                              disabled={entryKeys.length === 0}
                            >
                              Copy
                            </button>
                          </div>
                          <div class="codebox-body" class:is-empty={entryKeys.length === 0}>
                            {entryKeys.length ? entryKeys.join(", ") : "(empty)"}
                          </div>
                        </div>

                        <div class="codebox">
                          <div class="codebox-head">
                            <div class="codebox-title">Content</div>
                            <button
                              class="btn-ghost small"
                              onclick={() => copyField("Character book content", entryContent)}
                              disabled={!entryContent.trim()}
                            >
                              Copy
                            </button>
                          </div>
                          <div class="codebox-body" class:is-empty={!entryContent.trim()}>
                            {entryContent.trim() || "(empty)"}
                          </div>
                        </div>
                      </div>
                    </details>
                  {/each}
                {/if}

                <div class="codebox">
                  <div class="codebox-head">
                    <div class="codebox-title">Character Book JSON</div>
                    <button
                      class="btn-ghost small"
                      onclick={() => copyField("Character book", prettyJson(characterBook))}
                    >
                      Copy
                    </button>
                  </div>
                  <div class="codebox-body">{prettyJson(characterBook)}</div>
                </div>
              </div>
            </details>
          {:else if showEmpty}
            <div class="inspector-kv">
              <div class="inspector-k">Character Book</div>
              <div class="inspector-v">(none)</div>
            </div>
          {/if}
        {:else}
          <div class="codebox">
            <div class="codebox-head">
              <div class="codebox-title">Imported Card JSON</div>
              <button
                class="btn-ghost small"
                onclick={() => copyField("Card JSON", rawJson)}
                disabled={!rawJson.trim()}
              >
                Copy
              </button>
            </div>
            <div class="codebox-body" class:is-empty={!rawJson.trim()}>{rawJson.trim() || "(empty)"}</div>
          </div>
        {/if}
      {:else}
        <div class="codebox">
          <div class="codebox-head">
            <div class="codebox-title">No Card Data</div>
          </div>
          <div class="codebox-body is-empty">(missing or invalid card)</div>
        </div>
      {/if}
    </div>
  </div>
{/if}
