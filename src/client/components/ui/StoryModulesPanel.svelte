<script lang="ts">
  import type { StoryModules } from "../../api/client.js"

  export let modules: StoryModules
  export let setModules: (next: StoryModules) => void
  export let bare = false

  function updateModule<K extends keyof StoryModules>(key: K, value: StoryModules[K]) {
    setModules({ ...modules, [key]: value })
  }
</script>

<div class="modules-panel" class:bare>
  <div class="modules-group">
    <div class="control-section-label">Core</div>
    <label class="control-row">
      <span class="control-row-text">
        <span class="control-row-title">Track NPCs</span>
        <span class="control-row-sub">New stories track NPC state and updates</span>
      </span>
      <input
        type="checkbox"
        checked={modules.track_npcs}
        onchange={(e) => updateModule("track_npcs", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="control-row">
      <span class="control-row-text">
        <span class="control-row-title">Track locations</span>
        <span class="control-row-sub">New stories track location lists and presence</span>
      </span>
      <input
        type="checkbox"
        checked={modules.track_locations}
        onchange={(e) => updateModule("track_locations", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="control-row">
      <span class="control-row-text">
        <span class="control-row-title">Track background events</span>
        <span class="control-row-sub">Generate hidden off-screen events per turn</span>
      </span>
      <input
        type="checkbox"
        checked={modules.track_background_events}
        onchange={(e) => updateModule("track_background_events", (e.target as HTMLInputElement).checked)}
      />
    </label>
  </div>

  <div class="modules-group">
    <div class="control-section-label">Player</div>
    <label class="control-row">
      <span class="control-row-text">
        <span class="control-row-title">Player appearance + clothing</span>
        <span class="control-row-sub">Show and update appearance/clothing fields</span>
      </span>
      <input
        type="checkbox"
        checked={modules.character_appearance_clothing}
        onchange={(e) => updateModule("character_appearance_clothing", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="control-row">
      <span class="control-row-text">
        <span class="control-row-title">Player personality traits</span>
      </span>
      <input
        type="checkbox"
        checked={modules.character_personality_traits}
        onchange={(e) => updateModule("character_personality_traits", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="control-row">
      <span class="control-row-text">
        <span class="control-row-title">Player major flaws</span>
      </span>
      <input
        type="checkbox"
        checked={modules.character_major_flaws}
        onchange={(e) => updateModule("character_major_flaws", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="control-row">
      <span class="control-row-text">
        <span class="control-row-title">Player quirks</span>
      </span>
      <input
        type="checkbox"
        checked={modules.character_quirks}
        onchange={(e) => updateModule("character_quirks", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="control-row">
      <span class="control-row-text">
        <span class="control-row-title">Player perks</span>
      </span>
      <input
        type="checkbox"
        checked={modules.character_perks}
        onchange={(e) => updateModule("character_perks", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label class="control-row">
      <span class="control-row-text">
        <span class="control-row-title">Player inventory</span>
      </span>
      <input
        type="checkbox"
        checked={modules.character_inventory}
        onchange={(e) => updateModule("character_inventory", (e.target as HTMLInputElement).checked)}
      />
    </label>
  </div>

  <div class="modules-group">
    <div class="control-section-label">NPCs</div>
    <label
      class={"control-row" + (modules.track_npcs ? "" : " control-row--disabled")}
      aria-disabled={!modules.track_npcs}
    >
      <span class="control-row-text">
        <span class="control-row-title">NPC appearance + clothing</span>
      </span>
      <input
        type="checkbox"
        checked={modules.npc_appearance_clothing}
        disabled={!modules.track_npcs}
        onchange={(e) => updateModule("npc_appearance_clothing", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label
      class={"control-row" + (modules.track_npcs ? "" : " control-row--disabled")}
      aria-disabled={!modules.track_npcs}
    >
      <span class="control-row-text">
        <span class="control-row-title">NPC personality traits</span>
      </span>
      <input
        type="checkbox"
        checked={modules.npc_personality_traits}
        disabled={!modules.track_npcs}
        onchange={(e) => updateModule("npc_personality_traits", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label
      class={"control-row" + (modules.track_npcs ? "" : " control-row--disabled")}
      aria-disabled={!modules.track_npcs}
    >
      <span class="control-row-text">
        <span class="control-row-title">NPC major flaws</span>
      </span>
      <input
        type="checkbox"
        checked={modules.npc_major_flaws}
        disabled={!modules.track_npcs}
        onchange={(e) => updateModule("npc_major_flaws", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label
      class={"control-row" + (modules.track_npcs ? "" : " control-row--disabled")}
      aria-disabled={!modules.track_npcs}
    >
      <span class="control-row-text">
        <span class="control-row-title">NPC quirks</span>
      </span>
      <input
        type="checkbox"
        checked={modules.npc_quirks}
        disabled={!modules.track_npcs}
        onchange={(e) => updateModule("npc_quirks", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label
      class={"control-row" + (modules.track_npcs ? "" : " control-row--disabled")}
      aria-disabled={!modules.track_npcs}
    >
      <span class="control-row-text">
        <span class="control-row-title">NPC perks</span>
      </span>
      <input
        type="checkbox"
        checked={modules.npc_perks}
        disabled={!modules.track_npcs}
        onchange={(e) => updateModule("npc_perks", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label
      class={"control-row" + (modules.track_npcs ? "" : " control-row--disabled")}
      aria-disabled={!modules.track_npcs}
    >
      <span class="control-row-text">
        <span class="control-row-title">NPC location</span>
      </span>
      <input
        type="checkbox"
        checked={modules.npc_location}
        disabled={!modules.track_npcs}
        onchange={(e) => updateModule("npc_location", (e.target as HTMLInputElement).checked)}
      />
    </label>

    <label
      class={"control-row" + (modules.track_npcs ? "" : " control-row--disabled")}
      aria-disabled={!modules.track_npcs}
    >
      <span class="control-row-text">
        <span class="control-row-title">NPC activity</span>
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
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .modules-panel.bare {
    background: transparent;
    border: none;
    border-radius: 0;
    overflow: visible;
  }

  .modules-group + .modules-group {
    border-top: 1px solid var(--border);
  }

  .modules-group :global(.control-row:last-child) {
    border-bottom: none;
  }

  .modules-panel.bare :global(.control-section-label) {
    padding: 0.9rem 0 0.35rem;
    color: var(--text-dim);
  }

  .modules-panel.bare :global(.control-row) {
    padding: 0.75rem 0;
  }

  .modules-panel.bare .modules-group:first-child :global(.control-section-label) {
    padding-top: 0;
  }

  @media (max-width: 560px) {
    .modules-detail-row {
      flex-direction: column;
      align-items: stretch;
      gap: 0.6rem;
    }
    .modules-detail-row :global(.select-input) {
      width: 100%;
    }
  }
</style>
