<script lang="ts">
  import type { StoryCharacterGroup } from "@/shared/api-types"

  export let characters: StoryCharacterGroup[] = []
  export let selectedIds: number[] = []
  export let disabled = false
  export let locked = false
  export let excludeCharacterId: number | null = null
  export let onChange: (nextIds: number[]) => void = () => {}
  export let onOpenModules: (() => void) | undefined = undefined

  let query = ""

  function isSelected(id: number): boolean {
    return selectedIds.includes(id)
  }

  function isExcluded(id: number): boolean {
    return !!excludeCharacterId && id === excludeCharacterId
  }

  function toggle(id: number) {
    if (disabled || locked) return
    if (isExcluded(id)) return
    if (isSelected(id)) {
      onChange(selectedIds.filter((x) => x !== id))
      return
    }
    onChange([...selectedIds, id])
  }

  function remove(id: number) {
    if (disabled || locked) return
    onChange(selectedIds.filter((x) => x !== id))
  }

  function matches(group: StoryCharacterGroup, q: string): boolean {
    if (!q) return true
    const c = group.character
    const traits = [...c.personality_traits, ...c.quirks, ...c.perks].join(" ")
    return `${c.name} ${c.race} ${c.gender} ${traits}`.toLowerCase().includes(q)
  }

  $: q = query.trim().toLowerCase()
  $: filtered = characters.filter((g) => matches(g, q))
  $: selectedGroups = selectedIds
    .map((id) => characters.find((g) => g.id === id) ?? null)
    .filter((g): g is StoryCharacterGroup => !!g)
</script>

<div class="npc-picker" aria-label="NPCs from library">
  <div class="npc-picker__head">
    <div class="npc-picker__title">NPCs from Library</div>
    <div class="npc-picker__meta">{selectedIds.length} selected</div>
  </div>

  {#if disabled}
    <div class="npc-picker__disabled" role="note">
      <div class="npc-picker__disabled-title">NPC tracking is off.</div>
      <div class="npc-picker__disabled-text">Enable it in Story Modules to add NPCs at creation.</div>
      {#if onOpenModules}
        <button class="btn-ghost npc-picker__disabled-action" onclick={onOpenModules}>Edit modules</button>
      {/if}
    </div>
  {:else}
    <label class="npc-picker__search">
      <span class="sr-only">Search characters</span>
      <input
        class="text-input npc-picker__search-input"
        type="search"
        placeholder="Search characters…"
        bind:value={query}
        disabled={locked}
      />
    </label>

    {#if selectedGroups.length > 0}
      <div class="npc-picker__chips chips" aria-label="Selected NPC characters">
        {#each selectedGroups as group (group.id)}
          <button
            class="chip selected"
            type="button"
            onclick={() => remove(group.id)}
            aria-label={`Remove ${group.character.name}`}
            disabled={locked}
          >
            <span>{group.character.name}</span>
            <span class="npc-picker__chip-x" aria-hidden="true">×</span>
          </button>
        {/each}
      </div>
    {/if}

    <ul class="npc-picker__list" aria-label="Characters">
      {#if characters.length === 0}
        <li class="npc-picker__empty" role="status">No saved characters yet.</li>
      {:else if filtered.length === 0}
        <li class="npc-picker__empty" role="status">No matches.</li>
      {:else}
        {#each filtered as group (group.id)}
          {@const selected = isSelected(group.id)}
          {@const excluded = isExcluded(group.id)}
          <li class="npc-picker__item">
            <button
              class="npc-picker__row"
              class:npc-picker__row--selected={selected}
              type="button"
              onclick={() => toggle(group.id)}
              disabled={excluded || locked}
              aria-label={`${selected ? "Remove" : "Add"} ${group.character.name} as NPC${excluded ? " (player character)" : ""}`}
            >
              <div class="npc-picker__row-main">
                <div class="npc-picker__name">
                  {group.character.name}
                  {#if excluded}
                    <span class="badge npc-picker__badge" title="This is your selected player character">Player</span>
                  {/if}
                </div>
                <div class="npc-picker__sub">
                  {(group.character.race || "Unknown").trim()} · {(group.character.gender || "Unknown").trim()}
                </div>
              </div>
              <div class="npc-picker__row-end">
                <span class="badge npc-picker__badge">{selected ? "Selected" : "Add"}</span>
              </div>
            </button>
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</div>

<style>
  .npc-picker {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    padding: 0.75rem;
  }

  .npc-picker__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.65rem;
  }

  .npc-picker__title {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  .npc-picker__meta {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--text-dim);
    opacity: 0.8;
  }

  .npc-picker__disabled {
    border: 1px dashed var(--border);
    border-radius: var(--radius-md);
    padding: 0.75rem;
    background: var(--bg-raised);
  }

  .npc-picker__disabled-title {
    font-family: var(--font-ui);
    font-size: 0.9rem;
    color: var(--text);
    margin-bottom: 0.15rem;
  }

  .npc-picker__disabled-text {
    font-family: var(--font-ui);
    font-size: 0.82rem;
    color: var(--text-dim);
  }

  .npc-picker__disabled-action {
    margin-top: 0.5rem;
    width: 100%;
  }

  .npc-picker__search {
    display: block;
    margin-bottom: 0.65rem;
  }

  .npc-picker__search-input {
    width: 100%;
  }

  .npc-picker__chips {
    margin-bottom: 0.75rem;
  }

  .npc-picker__chip-x {
    opacity: 0.8;
    font-size: 0.95em;
    line-height: 1;
  }

  .npc-picker__list {
    display: grid;
    gap: 0.5rem;
    max-height: 260px;
    overflow: auto;
    padding-right: 0.1rem;
    list-style: none;
    margin: 0;
    padding-left: 0;
  }

  .npc-picker__empty {
    padding: 0.75rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-raised);
    color: var(--text-dim);
    font-family: var(--font-story);
    font-style: italic;
    text-align: center;
  }

  .npc-picker__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-raised);
    padding: 0.65rem 0.7rem;
    color: var(--text);
    text-align: left;
    transition:
      border-color 0.15s,
      background 0.15s,
      transform 0.08s;
  }

  .npc-picker__row:hover:not(:disabled) {
    border-color: var(--border-hover);
  }

  .npc-picker__row:active:not(:disabled) {
    transform: translateY(1px);
  }

  .npc-picker__row:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .npc-picker__row--selected {
    border-color: var(--accent);
    background: var(--accent-dim);
  }

  .npc-picker__row-main {
    min-width: 0;
  }

  .npc-picker__name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-ui);
    font-size: 0.95rem;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .npc-picker__sub {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--text-dim);
    margin-top: 0.12rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .npc-picker__row-end {
    flex: 0 0 auto;
  }

  .npc-picker__badge {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    opacity: 0.95;
  }
</style>
