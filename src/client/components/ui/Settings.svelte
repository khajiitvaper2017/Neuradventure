<script lang="ts">
  import { onMount } from "svelte"
  import { navigate } from "../../stores/ui.js"
  import {
    theme,
    design,
    textJustify,
    colorScheme,
    defaultAuthorNote,
    defaultAuthorNoteDepth,
    connector,
    generation,
    ctxLimitDetected,
  } from "../../stores/settings.js"
  import type { GenerationParams, SamplerPreset } from "../../api/client.js"
  import { presets, loadPresets } from "../../utils/presets.js"

  type SettingsTab = "appearance" | "generation"
  const SETTINGS_TAB_KEY = "settings_active_tab"

  function loadInitialTab(): SettingsTab {
    if (typeof window === "undefined") return "appearance"
    try {
      const stored = window.localStorage.getItem(SETTINGS_TAB_KEY)
      return stored === "generation" ? "generation" : "appearance"
    } catch {
      return "appearance"
    }
  }

  let activeTab: SettingsTab = $state(loadInitialTab())

  onMount(() => {
    void loadPresets()
  })

  $effect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(SETTINGS_TAB_KEY, activeTab)
    } catch {
      // Ignore storage failures (e.g., privacy mode).
    }
  })

  // Local copies for text inputs (committed on blur/enter)
  let connectorUrl = $state($connector.url)
  let connectorApiKey = $state($connector.api_key)
  let authorNoteDraft = $state($defaultAuthorNote)
  let authorNoteDepthDraft = $state($defaultAuthorNoteDepth)

  // Sync local copies when store changes externally
  $effect(() => {
    connectorUrl = $connector.url
  })
  $effect(() => {
    connectorApiKey = $connector.api_key
  })
  $effect(() => {
    authorNoteDraft = $defaultAuthorNote
  })
  $effect(() => {
    authorNoteDepthDraft = $defaultAuthorNoteDepth
  })

  function commitConnector() {
    const trimmedUrl = connectorUrl.trim()
    const trimmedKey = connectorApiKey.trim()
    if (trimmedUrl !== $connector.url || trimmedKey !== $connector.api_key) {
      connector.set({ ...$connector, url: trimmedUrl, api_key: trimmedKey })
    }
  }

  function commitAuthorNote() {
    const trimmedNote = authorNoteDraft.trim()
    const nextDepthRaw = Number(authorNoteDepthDraft)
    const nextDepth = Number.isFinite(nextDepthRaw) ? Math.min(100, Math.max(0, Math.floor(nextDepthRaw))) : 4
    if (trimmedNote !== $defaultAuthorNote) {
      defaultAuthorNote.set(trimmedNote)
    }
    if (nextDepth !== $defaultAuthorNoteDepth) {
      defaultAuthorNoteDepth.set(nextDepth)
    }
  }

  // ── Presets ──────────────────────────────────────────
  function detectPreset(gen: GenerationParams, list: SamplerPreset[]): string {
    for (const preset of list) {
      const match = (Object.keys(preset.params) as (keyof GenerationParams)[]).every((k) => gen[k] === preset.params[k])
      if (match) return preset.name
    }
    return "Custom"
  }

  let activePreset = $derived(detectPreset($generation, $presets))

  function applyPreset(name: string) {
    const preset = $presets.find((p: SamplerPreset) => p.name === name)
    if (preset) generation.set({ ...preset.params })
  }

  function setGen<K extends keyof GenerationParams>(key: K, value: GenerationParams[K]) {
    generation.set({ ...$generation, [key]: value })
  }

  function handleNumInput(key: keyof GenerationParams, e: Event, isInt = false) {
    const input = e.target as HTMLInputElement
    const raw = input.value.trim()
    if (raw === "" || raw === "-") return
    const val = isInt ? parseInt(raw, 10) : parseFloat(raw)
    if (!isNaN(val)) setGen(key, val)
  }

  type ParamDef = {
    key: keyof GenerationParams
    label: string
    sub: string
    min?: number
    max?: number
    step?: number
    int?: boolean
  }

  const samplingParams: ParamDef[] = [
    {
      key: "max_tokens",
      label: "Max Tokens",
      sub: "Maximum tokens to generate per request",
      min: 1,
      max: 8192,
      step: 1,
      int: true,
    },
    {
      key: "temperature",
      label: "Temperature",
      sub: "Controls randomness (0 = deterministic)",
      min: 0,
      max: 5,
      step: 0.05,
    },
    { key: "top_p", label: "Top-P (Nucleus)", sub: "Cumulative probability threshold", min: 0, max: 1, step: 0.01 },
    {
      key: "top_k",
      label: "Top-K",
      sub: "Keep only K most probable tokens (0 = disabled)",
      min: 0,
      max: 1000,
      step: 1,
      int: true,
    },
    {
      key: "min_p",
      label: "Min-P",
      sub: "Minimum probability relative to most likely token",
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      key: "typical_p",
      label: "Typical-P",
      sub: "Locally typical sampling (1.0 = disabled)",
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      key: "top_n_sigma",
      label: "Top-N Sigma",
      sub: "Standard deviations above mean (-1 = disabled)",
      min: -1,
      max: 10,
      step: 0.1,
    },
  ]

  const repetitionParams: ParamDef[] = [
    {
      key: "repeat_penalty",
      label: "Repeat Penalty",
      sub: "Penalty for repeating tokens (1.0 = disabled)",
      min: 0,
      max: 3,
      step: 0.05,
    },
    {
      key: "presence_penalty",
      label: "Presence Penalty",
      sub: "Penalty if token appeared at all (0 = disabled)",
      min: -2,
      max: 2,
      step: 0.05,
    },
    {
      key: "frequency_penalty",
      label: "Frequency Penalty",
      sub: "Penalty based on token count (0 = disabled)",
      min: -2,
      max: 2,
      step: 0.05,
    },
    {
      key: "repeat_last_n",
      label: "Repeat Penalty Range",
      sub: "Tokens to scan for repeats (-1 = context, 0 = off)",
      min: -1,
      max: 4096,
      step: 1,
      int: true,
    },
  ]

  const mirostatParams: ParamDef[] = [
    {
      key: "mirostat",
      label: "Mirostat Mode",
      sub: "0 = off, 1 = Mirostat, 2 = Mirostat 2.0",
      min: 0,
      max: 2,
      step: 1,
      int: true,
    },
    { key: "mirostat_tau", label: "Mirostat Tau", sub: "Target entropy", min: 0, max: 20, step: 0.1 },
    { key: "mirostat_eta", label: "Mirostat Eta", sub: "Learning rate", min: 0, max: 1, step: 0.01 },
  ]

  const dynatempParams: ParamDef[] = [
    {
      key: "dynatemp_range",
      label: "Dynamic Temp Range",
      sub: "Temperature variation range (0 = disabled)",
      min: 0,
      max: 5,
      step: 0.05,
    },
    {
      key: "dynatemp_exponent",
      label: "Dynamic Temp Exponent",
      sub: "Exponent for entropy mapping",
      min: 0.1,
      max: 5,
      step: 0.1,
    },
  ]

  const dryParams: ParamDef[] = [
    {
      key: "dry_multiplier",
      label: "DRY Multiplier",
      sub: "Diverse repetition penalty strength (0 = disabled)",
      min: 0,
      max: 5,
      step: 0.05,
    },
    {
      key: "dry_penalty_last_n",
      label: "DRY Penalty Range",
      sub: "Tokens to scan (-1 = context, 0 = off)",
      min: -1,
      max: 4096,
      step: 1,
      int: true,
    },
    { key: "dry_base", label: "DRY Base", sub: "Base multiplier for penalty", min: 1, max: 4, step: 0.05 },
    {
      key: "dry_allowed_length",
      label: "DRY Allowed Length",
      sub: "Repetitions up to this length are allowed",
      min: 0,
      max: 20,
      step: 1,
      int: true,
    },
  ]

  const xtcParams: ParamDef[] = [
    {
      key: "xtc_probability",
      label: "XTC Probability",
      sub: "Chance of applying token cutting (0 = disabled)",
      min: 0,
      max: 1,
      step: 0.05,
    },
    {
      key: "xtc_threshold",
      label: "XTC Threshold",
      sub: "Token probability threshold (>0.5 disables)",
      min: 0,
      max: 1,
      step: 0.05,
    },
  ]

  const otherParams: ParamDef[] = [
    {
      key: "ctx_limit",
      label: "Ctx Limit",
      sub: "Max prompt tokens before compressing history (0 = off)",
      min: 0,
      max: 32768,
      step: 1,
      int: true,
    },
    {
      key: "seed",
      label: "Seed",
      sub: "Random seed (-1 = random each call)",
      min: -1,
      max: 2147483647,
      step: 1,
      int: true,
    },
  ]
</script>

<div class="screen settings">
  <header class="screen-header">
    <button class="back-btn" onclick={() => navigate("home")}>← Back</button>
    <h2 class="screen-title">Settings</h2>
  </header>

  <nav class="tabs">
    <button class="tab" class:active={activeTab === "appearance"} onclick={() => (activeTab = "appearance")}>
      Appearance
    </button>
    <button class="tab" class:active={activeTab === "generation"} onclick={() => (activeTab = "generation")}>
      Text Generation
    </button>
  </nav>

  <div class="list" data-scroll-root="screen">
    {#if activeTab === "appearance"}
      <!-- Theme section -->
      <div class="section-label">Theme</div>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">Theme</span>
          <span class="row-sub">Overall background tone</span>
        </span>
        <select class="select-input" bind:value={$theme}>
          <option value="default">Default — Dark gray background</option>
          <option value="amoled">AMOLED — Pure black (OLED)</option>
        </select>
      </label>

      <div class="divider"></div>

      <!-- Design section -->
      <div class="section-label">Typography</div>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">Typography</span>
          <span class="row-sub">Fonts for story and UI</span>
        </span>
        <select class="select-input" bind:value={$design}>
          <option value="classic">Classic — Spectral + DM Sans</option>
          <option value="roboto">Roboto — clean sans-serif</option>
        </select>
      </label>

      <div class="divider"></div>

      <!-- Color scheme section -->
      <div class="section-label">Color Scheme</div>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">Accent</span>
          <span class="row-sub">Highlight color for buttons and UI</span>
        </span>
        <select class="select-input" bind:value={$colorScheme}>
          <option value="gold">Gold — Warm, classic accent</option>
          <option value="emerald">Emerald — Cool green accent</option>
          <option value="sapphire">Sapphire — Blue with strong contrast</option>
          <option value="crimson">Crimson — Bold red accent</option>
        </select>
      </label>

      <div class="divider"></div>

      <!-- Text layout -->
      <div class="section-label">Text Layout</div>

      <label class="row">
        <span class="row-text">
          <span class="row-title">Justify text</span>
          <span class="row-sub">Align paragraph edges for a book-like look</span>
        </span>
        <input type="checkbox" bind:checked={$textJustify} />
      </label>
    {:else if activeTab === "generation"}
      <!-- Connection -->
      <div class="section-label">Connection</div>

      <div class="row row-input">
        <span class="row-text">
          <span class="row-title">Backend</span>
          <span class="row-sub">KoboldCpp (OpenAI-compatible)</span>
        </span>
        <span class="connector-badge">{$connector.type}</span>
      </div>

      <div class="row row-input">
        <span class="row-text">
          <span class="row-title">Ctx Limit (Detected)</span>
          <span class="row-sub">Fetched from KoboldCpp on server start</span>
        </span>
        <span class="connector-badge">{$ctxLimitDetected > 0 ? $ctxLimitDetected : "Unknown"}</span>
      </div>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">API URL</span>
        </span>
        <input
          class="text-input"
          type="text"
          bind:value={connectorUrl}
          onblur={commitConnector}
          onkeydown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          }}
        />
      </label>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">API Key</span>
        </span>
        <input
          class="text-input"
          type="text"
          bind:value={connectorApiKey}
          onblur={commitConnector}
          onkeydown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          }}
        />
      </label>

      <div class="divider"></div>

      <!-- Story Defaults -->
      <div class="section-label">Story Defaults</div>

      <label class="row row-input row-stack">
        <span class="row-text">
          <span class="row-title">Default Author Note</span>
          <span class="row-sub">Applied to newly created stories</span>
        </span>
        <textarea class="text-input" rows="3" bind:value={authorNoteDraft} onblur={commitAuthorNote}></textarea>
      </label>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">Author Note Depth</span>
          <span class="row-sub">How many recent turns from the bottom to inject</span>
        </span>
        <input
          class="num-input"
          type="number"
          min="0"
          max="100"
          step="1"
          bind:value={authorNoteDepthDraft}
          onblur={commitAuthorNote}
        />
      </label>

      <div class="divider"></div>

      <!-- Preset -->
      <div class="section-label">Sampler Preset</div>
      <div class="preset-row">
        {#each $presets as preset}
          <button
            class="preset-btn"
            class:active={activePreset === preset.name}
            onclick={() => applyPreset(preset.name)}
            title={preset.description}
          >
            {preset.name}
          </button>
        {/each}
        {#if activePreset === "Custom"}
          <span class="preset-btn custom-badge">Custom</span>
        {/if}
      </div>

      <div class="divider"></div>

      <!-- Sampling -->
      <div class="section-label">Sampling</div>
      {#each samplingParams as p}
        <label class="row row-input">
          <span class="row-text">
            <span class="row-title">{p.label}</span>
            <span class="row-sub">{p.sub}</span>
          </span>
          <input
            class="num-input"
            type="number"
            value={$generation[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            onchange={(e) => handleNumInput(p.key, e, p.int)}
          />
        </label>
      {/each}

      <div class="divider"></div>

      <!-- Repetition Penalties -->
      <div class="section-label">Repetition Penalties</div>
      {#each repetitionParams as p}
        <label class="row row-input">
          <span class="row-text">
            <span class="row-title">{p.label}</span>
            <span class="row-sub">{p.sub}</span>
          </span>
          <input
            class="num-input"
            type="number"
            value={$generation[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            onchange={(e) => handleNumInput(p.key, e, p.int)}
          />
        </label>
      {/each}

      <div class="divider"></div>

      <!-- DRY -->
      <div class="section-label">DRY (Diverse Repetition Penalty)</div>
      {#each dryParams as p}
        <label class="row row-input">
          <span class="row-text">
            <span class="row-title">{p.label}</span>
            <span class="row-sub">{p.sub}</span>
          </span>
          <input
            class="num-input"
            type="number"
            value={$generation[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            onchange={(e) => handleNumInput(p.key, e, p.int)}
          />
        </label>
      {/each}

      <div class="divider"></div>

      <!-- Mirostat -->
      <div class="section-label">Mirostat</div>
      {#each mirostatParams as p}
        <label class="row row-input">
          <span class="row-text">
            <span class="row-title">{p.label}</span>
            <span class="row-sub">{p.sub}</span>
          </span>
          <input
            class="num-input"
            type="number"
            value={$generation[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            onchange={(e) => handleNumInput(p.key, e, p.int)}
          />
        </label>
      {/each}

      <div class="divider"></div>

      <!-- Dynamic Temperature -->
      <div class="section-label">Dynamic Temperature</div>
      {#each dynatempParams as p}
        <label class="row row-input">
          <span class="row-text">
            <span class="row-title">{p.label}</span>
            <span class="row-sub">{p.sub}</span>
          </span>
          <input
            class="num-input"
            type="number"
            value={$generation[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            onchange={(e) => handleNumInput(p.key, e, p.int)}
          />
        </label>
      {/each}

      <div class="divider"></div>

      <!-- XTC -->
      <div class="section-label">XTC (Token Cutting)</div>
      {#each xtcParams as p}
        <label class="row row-input">
          <span class="row-text">
            <span class="row-title">{p.label}</span>
            <span class="row-sub">{p.sub}</span>
          </span>
          <input
            class="num-input"
            type="number"
            value={$generation[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            onchange={(e) => handleNumInput(p.key, e, p.int)}
          />
        </label>
      {/each}

      <div class="divider"></div>

      <!-- Other -->
      <div class="section-label">Other</div>
      {#each otherParams as p}
        <label class="row row-input">
          <span class="row-text">
            <span class="row-title">{p.label}</span>
            <span class="row-sub">{p.sub}</span>
          </span>
          <input
            class="num-input"
            type="number"
            value={$generation[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            onchange={(e) => handleNumInput(p.key, e, p.int)}
          />
        </label>
      {/each}

      <div class="bottom-pad"></div>
    {/if}
  </div>
</div>

<style>
  .settings {
    background: var(--bg);
  }

  /* ── Tabs ──────────────────────────────────────────── */
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .tab {
    flex: 1;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-dim);
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 500;
    padding: 0.7rem 0.5rem;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s;
    letter-spacing: 0.02em;
  }
  .tab:hover {
    color: var(--text);
  }
  .tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  /* ── List ──────────────────────────────────────────── */
  .list {
    flex: 1;
    overflow-y: auto;
  }

  .section-label {
    padding: 1.25rem 1rem 0.4rem;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    color: var(--accent);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.12s;
    gap: 1rem;
  }
  .row:hover {
    background: var(--bg-action);
  }

  .row-text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex: 1;
    min-width: 0;
  }
  .row-title {
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 400;
    color: var(--text);
  }
  .row-sub {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-dim);
    line-height: 1.4;
  }

  input[type="radio"] {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
    flex-shrink: 0;
    cursor: pointer;
  }

  /* ── Input fields ─────────────────────────────────── */
  .row-input {
    cursor: default;
  }
  .row-stack {
    flex-direction: column;
    align-items: stretch;
    gap: 0.6rem;
  }
  .row-stack .text-input {
    width: 100%;
  }

  .connector-badge {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-dim);
    padding: 0.25rem 0.6rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  /* ── Presets ──────────────────────────────────────── */
  .preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.6rem 1rem 0.8rem;
  }
  .preset-btn {
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 500;
    padding: 0.4rem 0.85rem;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s,
      background 0.15s;
  }
  .preset-btn:hover {
    color: var(--text);
    border-color: var(--border-hover);
  }
  .preset-btn.active {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-dim);
  }
  .custom-badge {
    cursor: default;
    font-style: italic;
    opacity: 0.7;
  }

  .bottom-pad {
    height: 2rem;
  }
</style>
