<script lang="ts">
  import { api, type PromptConfigFile } from "../../../api/client.js"
  import Select from "../../../components/ui/Select.svelte"
  import { sectionFormat } from "../../../stores/settings.js"

  type Props = {
    active?: boolean
  }

  let { active = false }: Props = $props()

  const PROMPT_LABELS: Record<PromptConfigFile["name"], string> = {
    "narrative-turn": "Narrative Turn",
    "character-generation": "Character Generation",
    "story-setup": "Story Setup",
    "chat-mode": "Chat Mode",
    "npc-creation": "NPC Creation",
    "player-impersonation": "Player Impersonation",
  }

  const SECTION_FORMAT_OPTIONS = [
    { value: "markdown", label: "Markdown — ## Section" },
    { value: "xml", label: "XML — <section>…</section>" },
    { value: "equals", label: "Equals — === SECTION ===" },
    { value: "bbcode", label: "BBCode — [section]…[/section]" },
    { value: "colon", label: "Colon — Section:" },
    { value: "none", label: "None — no wrappers" },
  ]

  let promptFiles = $state<PromptConfigFile[]>([])
  let promptSelected = $state<PromptConfigFile["name"]>("narrative-turn")
  let promptDraft = $state<string>("")
  let promptDirty = $state(false)
  let promptLoading = $state(false)
  let promptSaving = $state(false)
  let promptError = $state<string | null>(null)
  let promptSelectedRow = $derived(promptFiles.find((p) => p.name === promptSelected) ?? null)

  let loadedOnce = $state(false)

  async function loadPromptFiles(options?: { preserveSelection?: boolean }) {
    if (promptLoading) return
    const prevSelected = options?.preserveSelection ? promptSelected : null
    promptLoading = true
    promptError = null
    try {
      const rows = await api.settings.promptConfigs()
      promptFiles = rows
      const preferred = prevSelected && rows.some((r) => r.name === prevSelected) ? prevSelected : null
      const nextName = preferred ?? rows[0]?.name ?? null
      if (nextName) {
        promptSelected = nextName
        const row = rows.find((r) => r.name === nextName)
        promptDraft = row?.config_json ?? ""
        promptDirty = false
      } else {
        promptDraft = ""
        promptDirty = false
      }
      loadedOnce = true
    } catch (err) {
      console.error("[prompts] Failed to load prompt configs", err)
      promptError = "Failed to load prompt configs."
    } finally {
      promptLoading = false
    }
  }

  function selectPromptFile(name: PromptConfigFile["name"]) {
    if (name === promptSelected) return
    if (promptDirty && typeof window !== "undefined") {
      const ok = window.confirm("Discard unsaved prompt changes?")
      if (!ok) return
    }
    promptError = null
    promptDirty = false
    promptSelected = name
    const row = promptFiles.find((p) => p.name === name)
    promptDraft = row?.config_json ?? ""
  }

  async function savePromptFile() {
    if (promptSaving) return
    promptError = null
    try {
      JSON.parse(promptDraft)
    } catch (err) {
      promptError = err instanceof Error ? err.message : "Invalid JSON"
      return
    }
    promptSaving = true
    try {
      const updated = await api.settings.updatePromptConfig(promptSelected, promptDraft)
      promptFiles = promptFiles.map((p) => (p.name === updated.name ? updated : p))
      promptDraft = updated.config_json
      promptDirty = false
    } catch (err) {
      console.error("[prompts] Failed to save prompt config", err)
      promptError = err instanceof Error ? err.message : "Failed to save prompt config."
    } finally {
      promptSaving = false
    }
  }

  async function resetPromptFile() {
    if (promptSaving) return
    if (typeof window !== "undefined") {
      const ok = window.confirm("Reset this prompt config to the built-in defaults?")
      if (!ok) return
    }
    promptSaving = true
    promptError = null
    try {
      const updated = await api.settings.resetPromptConfig(promptSelected)
      promptFiles = promptFiles.map((p) => (p.name === updated.name ? updated : p))
      promptDraft = updated.config_json
      promptDirty = false
    } catch (err) {
      console.error("[prompts] Failed to reset prompt config", err)
      promptError = err instanceof Error ? err.message : "Failed to reset prompt config."
    } finally {
      promptSaving = false
    }
  }

  async function resetAllPromptFiles() {
    if (promptSaving) return
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "Reset ALL prompt templates to built-in defaults? This will overwrite all prompt edits.",
      )
      if (!ok) return
    }
    promptSaving = true
    promptError = null
    promptDirty = false
    try {
      await api.settings.resetAllPromptConfigs()
      await loadPromptFiles({ preserveSelection: true })
    } catch (err) {
      console.error("[prompts] Failed to reset all prompt configs", err)
      promptError = err instanceof Error ? err.message : "Failed to reset all prompt configs."
    } finally {
      promptSaving = false
    }
  }

  function formatPromptDraft() {
    promptError = null
    try {
      const parsed = JSON.parse(promptDraft) as unknown
      promptDraft = JSON.stringify(parsed, null, 2)
      promptDirty = true
    } catch (err) {
      promptError = err instanceof Error ? err.message : "Invalid JSON"
    }
  }

  $effect(() => {
    if (!active) return
    if (loadedOnce) return
    void loadPromptFiles()
  })

  $effect(() => {
    if (promptFiles.length === 0) return
    const row = promptFiles.find((p) => p.name === promptSelected) ?? promptFiles[0]
    if (!row) return
    if (row.name !== promptSelected) promptSelected = row.name
    if (!promptDirty) promptDraft = row.config_json
  })
</script>

<div class="control-section-label">Prompt Formatting</div>

<div class="prompt-hint">
  Controls how context sections are wrapped in prompts sent to the model. Does not change the required JSON output
  format.
</div>

<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Section wrapper format</span>
    <span class="control-row-sub">Global setting (applies to all prompts)</span>
  </span>
  <Select bind:value={$sectionFormat} options={SECTION_FORMAT_OPTIONS} ariaLabel="Section wrapper format" />
</label>

<div class="divider"></div>

<div class="control-section-label">Prompt Templates</div>

<div class="prompt-hint">Advanced: edit JSON stored in SQLite. Changes affect future generations immediately.</div>

<div class="prompt-rail" aria-label="Prompt file picker">
  {#if promptFiles.length === 0}
    <div class="prompt-rail-empty">{promptLoading ? "Loading…" : "No prompt templates found."}</div>
  {:else}
    {#each promptFiles as p (p.name)}
      <button
        type="button"
        class="prompt-pill"
        class:active={p.name === promptSelected}
        disabled={promptLoading || promptSaving}
        aria-pressed={p.name === promptSelected}
        onclick={() => selectPromptFile(p.name)}
      >
        <span class="prompt-pill-label">{PROMPT_LABELS[p.name] ?? p.name}</span>
        {#if p.name === promptSelected && promptDirty}
          <span class="prompt-pill-dirty" title="Unsaved changes" aria-label="Unsaved changes">●</span>
        {/if}
      </button>
    {/each}
  {/if}
</div>

<label class="control-row control-row--input control-row--stack">
  <span class="control-row-text">
    <span class="control-row-title">Config (JSON)</span>
    <span class="control-row-sub">
      {promptLoading
        ? "Loading…"
        : promptSelectedRow?.updated_at
          ? `Updated: ${promptSelectedRow.updated_at}`
          : "Not loaded"}
    </span>
  </span>
  <textarea
    class="text-input prompt-editor"
    rows="18"
    bind:value={promptDraft}
    spellcheck="false"
    disabled={promptLoading || promptSaving}
    oninput={() => (promptDirty = true)}
  ></textarea>
</label>

{#if promptError}
  <div class="prompt-error">{promptError}</div>
{/if}

<div class="prompt-actions">
  <button
    type="button"
    class="btn-primary small"
    disabled={!promptDirty || promptSaving || promptLoading}
    onclick={savePromptFile}
  >
    {promptSaving ? "Saving…" : "Save"}
  </button>
  <button type="button" class="btn-ghost small" disabled={promptSaving || promptLoading} onclick={formatPromptDraft}>
    Format
  </button>
  <button type="button" class="btn-ghost small" disabled={promptSaving || promptLoading} onclick={resetPromptFile}>
    Reset
  </button>
  <button
    type="button"
    class="btn-ghost small prompt-danger"
    disabled={promptSaving || promptLoading}
    onclick={resetAllPromptFiles}
  >
    Reset All
  </button>
</div>

<div class="settings-bottom-pad"></div>

<style>
  .prompt-hint {
    padding: 0.45rem 1rem 0.15rem;
    color: var(--text-dim);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .prompt-rail {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem 1rem 0.4rem;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .prompt-rail-empty {
    padding: 0.15rem 0;
    color: var(--text-dim);
    font-size: 0.8rem;
    line-height: 1.3;
  }

  .prompt-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.38rem 0.65rem;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: var(--bg-input);
    color: var(--text-dim);
    font-family: var(--font-ui);
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
    transition:
      border-color 0.15s var(--ease-out),
      color 0.15s var(--ease-out),
      background 0.15s var(--ease-out);
  }

  .prompt-pill:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--border-hover);
    background: rgba(255, 255, 255, 0.02);
  }

  .prompt-pill:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .prompt-pill.active {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-dim);
  }

  .prompt-pill-dirty {
    color: var(--danger);
    font-size: 0.7rem;
    line-height: 1;
    transform: translateY(-0.5px);
  }

  .prompt-editor {
    width: 100%;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  .prompt-actions {
    display: flex;
    gap: 0.6rem;
    padding: 0.6rem 1rem 0.2rem;
    flex-wrap: wrap;
  }

  .prompt-danger {
    color: var(--danger);
    border-color: rgba(181, 64, 64, 0.5);
  }

  .prompt-danger:hover:not(:disabled) {
    color: var(--danger);
    border-color: var(--danger);
    background: rgba(181, 64, 64, 0.08);
  }

  .prompt-error {
    padding: 0.2rem 1rem 0.6rem;
    color: var(--danger);
    font-size: 0.85rem;
    line-height: 1.35;
  }

  .settings-bottom-pad {
    height: 2rem;
  }
</style>
