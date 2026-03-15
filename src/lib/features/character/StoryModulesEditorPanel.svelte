<script lang="ts">
  import type { StoryModules } from "@/shared/types"
  import StoryModulesPanel from "@/components/panels/StoryModulesPanel.svelte"

  export let open = false
  export let modules: StoryModules
  export let setModules: (next: StoryModules) => void
  export let onClose: (() => void) | undefined = undefined
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={onClose}></div>
  <div class="panel panel--wide">
    <div class="panel-header">
      <span>Story Modules</span>
      <button class="panel-close" onclick={onClose} aria-label="Close">×</button>
    </div>
    <div class="panel-body" data-scroll-root="modal">
      <StoryModulesPanel {modules} {setModules} bare />
    </div>
  </div>
{/if}
