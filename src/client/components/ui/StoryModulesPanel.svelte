<script lang="ts">
  import type { StoryModules } from "../../api/client.js"

  export let modules: StoryModules
  export let setModules: (next: StoryModules) => void

  function updateModule<K extends keyof StoryModules>(key: K, value: StoryModules[K]) {
    setModules({ ...modules, [key]: value })
  }

  function updateDetailMode(next: StoryModules["character_detail_mode"]) {
    const nextModules: StoryModules = { ...modules, character_detail_mode: next }
    if (next === "detailed") nextModules.character_appearance_clothing = true
    setModules(nextModules)
  }
</script>

<div class="modules-panel">
  <div class="group">
    <div class="section-label">Core</div>
    <label class="row">
      <span class="row-text">
        <span class="row-title">Track NPCs</span>
        <span class="row-sub">New stories track NPC state and updates</span>
      </span>
      <input
        type="checkbox"
        checked={modules.track_npcs}
        onchange={(e) => updateModule("track_npcs", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="row">
      <span class="row-text">
        <span class="row-title">Track locations</span>
        <span class="row-sub">New stories track location lists and presence</span>
      </span>
      <input
        type="checkbox"
        checked={modules.track_locations}
        onchange={(e) => updateModule("track_locations", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="row row-input">
      <span class="row-text">
        <span class="row-title">Character detail mode</span>
        <span class="row-sub">Default character detail style for new stories</span>
      </span>
      <select
        class="select-input"
        value={modules.character_detail_mode}
        onchange={(e) => updateDetailMode((e.target as HTMLSelectElement).value as StoryModules["character_detail_mode"])}
      >
        <option value="detailed">Detailed (appearance + traits)</option>
        <option value="general">General description only</option>
      </select>
    </label>
  </div>

  <div class="group">
    <div class="section-label">Player</div>
    {#if modules.character_detail_mode === "detailed"}
      <label class="row">
        <span class="row-text">
          <span class="row-title">Player appearance + clothing</span>
          <span class="row-sub">Always enabled in detailed mode</span>
        </span>
        <input type="checkbox" checked={true} disabled />
      </label>
    {/if}

    <label class="row">
      <span class="row-text">
        <span class="row-title">Player personality traits</span>
      </span>
      <input
        type="checkbox"
        checked={modules.character_personality_traits}
        onchange={(e) => updateModule("character_personality_traits", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="row">
      <span class="row-text">
        <span class="row-title">Player major flaws</span>
      </span>
      <input
        type="checkbox"
        checked={modules.character_major_flaws}
        onchange={(e) => updateModule("character_major_flaws", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="row">
      <span class="row-text">
        <span class="row-title">Player quirks</span>
      </span>
      <input
        type="checkbox"
        checked={modules.character_quirks}
        onchange={(e) => updateModule("character_quirks", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="row">
      <span class="row-text">
        <span class="row-title">Player perks</span>
      </span>
      <input
        type="checkbox"
        checked={modules.character_perks}
        onchange={(e) => updateModule("character_perks", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="row">
      <span class="row-text">
        <span class="row-title">Player inventory</span>
      </span>
      <input
        type="checkbox"
        checked={modules.character_inventory}
        onchange={(e) => updateModule("character_inventory", (e.target as HTMLInputElement).checked)}
      />
    </label>
  </div>

  <div class="group">
    <div class="section-label">NPCs</div>
    <label class="row" class:is-disabled={!modules.track_npcs} aria-disabled={!modules.track_npcs}>
      <span class="row-text">
        <span class="row-title">NPC appearance + clothing</span>
      </span>
      <input
        type="checkbox"
        checked={modules.npc_appearance_clothing}
        disabled={!modules.track_npcs}
        onchange={(e) => updateModule("npc_appearance_clothing", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="row" class:is-disabled={!modules.track_npcs} aria-disabled={!modules.track_npcs}>
      <span class="row-text">
        <span class="row-title">NPC personality traits</span>
      </span>
      <input
        type="checkbox"
        checked={modules.npc_personality_traits}
        disabled={!modules.track_npcs}
        onchange={(e) => updateModule("npc_personality_traits", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="row" class:is-disabled={!modules.track_npcs} aria-disabled={!modules.track_npcs}>
      <span class="row-text">
        <span class="row-title">NPC major flaws</span>
      </span>
      <input
        type="checkbox"
        checked={modules.npc_major_flaws}
        disabled={!modules.track_npcs}
        onchange={(e) => updateModule("npc_major_flaws", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="row" class:is-disabled={!modules.track_npcs} aria-disabled={!modules.track_npcs}>
      <span class="row-text">
        <span class="row-title">NPC quirks</span>
      </span>
      <input
        type="checkbox"
        checked={modules.npc_quirks}
        disabled={!modules.track_npcs}
        onchange={(e) => updateModule("npc_quirks", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="row" class:is-disabled={!modules.track_npcs} aria-disabled={!modules.track_npcs}>
      <span class="row-text">
        <span class="row-title">NPC perks</span>
      </span>
      <input
        type="checkbox"
        checked={modules.npc_perks}
        disabled={!modules.track_npcs}
        onchange={(e) => updateModule("npc_perks", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="row" class:is-disabled={!modules.track_npcs} aria-disabled={!modules.track_npcs}>
      <span class="row-text">
        <span class="row-title">NPC location</span>
      </span>
      <input
        type="checkbox"
        checked={modules.npc_location}
        disabled={!modules.track_npcs}
        onchange={(e) => updateModule("npc_location", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="row" class:is-disabled={!modules.track_npcs} aria-disabled={!modules.track_npcs}>
      <span class="row-text">
        <span class="row-title">NPC activity</span>
      </span>
      <input
        type="checkbox"
        checked={modules.npc_activity}
        disabled={!modules.track_npcs}
        onchange={(e) => updateModule("npc_activity", (e.target as HTMLInputElement).checked)}
      />
    </label>
  </div>
</div>

<style>
  .modules-panel {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .section-label {
    padding: 1.25rem 1rem 0.4rem;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    color: var(--accent);
    text-transform: none;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.12s ease;
    gap: 1rem;
  }
  .row:hover {
    background: var(--bg-action);
  }
  .row-input {
    cursor: default;
  }
  .row.is-disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .row.is-disabled:hover {
    background: transparent;
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
  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
    flex-shrink: 0;
    cursor: pointer;
  }
  .row.is-disabled input[type="checkbox"] {
    cursor: not-allowed;
  }
</style>
