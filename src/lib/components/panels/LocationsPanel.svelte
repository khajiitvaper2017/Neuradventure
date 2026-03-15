<script lang="ts">
  import { showLocations } from "@/stores/ui"
  import { worldState } from "@/stores/game"
  import type { Location } from "@/shared/types"
  import IconMapPin from "@/components/icons/IconMapPin.svelte"
  import IconUsers from "@/components/icons/IconUsers.svelte"
  import IconCube from "@/components/icons/IconCube.svelte"
  import IconDocument from "@/components/icons/IconDocument.svelte"

  let { inline = false }: { inline?: boolean } = $props()

  const currentSceneKey = $derived($worldState?.current_scene?.trim().toLowerCase() ?? "")

  const sortedLocations = $derived(
    (() => {
      const ws = $worldState
      if (!ws) return [] as Location[]
      const locations = ws.locations ?? []
      const current = ws.current_scene.trim().toLowerCase()
      return [...locations].sort((a, b) => {
        const aCurrent = a.name.trim().toLowerCase() === current
        const bCurrent = b.name.trim().toLowerCase() === current
        if (aCurrent && !bCurrent) return -1
        if (!aCurrent && bCurrent) return 1
        return a.name.localeCompare(b.name)
      })
    })(),
  )

  function listLabel(items: string[]): string {
    return items.length > 0 ? items.join(", ") : "none"
  }

  function itemLabel(items: Location["available_items"]): string {
    return items.length > 0 ? items.map((item) => `${item.name} (${item.description})`).join(", ") : "none"
  }
</script>

{#if inline}
  <div class="sidebar">
    <div class="sidebar-header">
      <IconMapPin size={16} strokeWidth={1.5} className="location-header-icon" />
      <span>Locations ({sortedLocations.length})</span>
    </div>
    <div class="sidebar-body" data-scroll-root="modal">
      {#if !$worldState}
        <div class="empty">No active story.</div>
      {:else if sortedLocations.length === 0}
        <div class="empty">No locations yet.</div>
      {:else}
        {#each sortedLocations as location (location.name)}
          <div class="surface location-card" class:current={location.name.trim().toLowerCase() === currentSceneKey}>
            <div class="location-title">
              <span class="location-name">{location.name}</span>
              {#if location.name.trim().toLowerCase() === currentSceneKey}
                <span class="badge">Current</span>
              {/if}
            </div>

            <div class="location-row">
              <IconDocument size={13} strokeWidth={1.5} className="location-icon" />
              <span>{location.description}</span>
            </div>

            <div class="location-row">
              <IconUsers size={13} strokeWidth={1.5} className="location-icon" />
              <span>{listLabel(location.characters)}</span>
            </div>

            <div class="location-row muted">
              <IconCube size={13} strokeWidth={1.5} className="location-icon" />
              <span>{itemLabel(location.available_items)}</span>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
{:else if $showLocations}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={() => showLocations.set(false)}></div>
  <div class="panel">
    <div class="panel-header">
      <IconMapPin size={16} strokeWidth={1.5} className="location-header-icon" />
      <span>Locations ({sortedLocations.length})</span>
      <button class="panel-close" onclick={() => showLocations.set(false)} aria-label="Close">×</button>
    </div>
    <div class="panel-body" data-scroll-root="modal">
      {#if !$worldState}
        <div class="empty">No active story.</div>
      {:else if sortedLocations.length === 0}
        <div class="empty">No locations yet.</div>
      {:else}
        {#each sortedLocations as location (location.name)}
          <div class="surface location-card" class:current={location.name.trim().toLowerCase() === currentSceneKey}>
            <div class="location-title">
              <span class="location-name">{location.name}</span>
              {#if location.name.trim().toLowerCase() === currentSceneKey}
                <span class="badge">Current</span>
              {/if}
            </div>

            <div class="location-row">
              <IconDocument size={13} strokeWidth={1.5} className="location-icon" />
              <span>{location.description}</span>
            </div>

            <div class="location-row">
              <IconUsers size={13} strokeWidth={1.5} className="location-icon" />
              <span>{listLabel(location.characters)}</span>
            </div>

            <div class="location-row muted">
              <IconCube size={13} strokeWidth={1.5} className="location-icon" />
              <span>{itemLabel(location.available_items)}</span>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style>
  :global(.location-header-icon) {
    color: var(--text);
    flex-shrink: 0;
    margin-right: 0.4rem;
    opacity: 0.6;
  }

  .location-card {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .location-card.current {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .location-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .location-name {
    font-weight: 600;
    font-family: var(--font-story);
    color: var(--text);
    font-size: 0.95rem;
  }

  .location-row {
    display: flex;
    align-items: flex-start;
    gap: 0.45rem;
    font-size: 0.78rem;
    color: var(--text);
    line-height: 1.35;
  }

  .location-row.muted {
    color: var(--text-dim);
  }

  :global(.location-icon) {
    color: var(--text);
    flex-shrink: 0;
    opacity: 0.5;
    margin-top: 0.1rem;
  }
</style>
