<script lang="ts">
  import StoryModulesPanel from "@/components/panels/StoryModulesPanel.svelte"
  import { storyDefaults } from "@/stores/settings"
  import type { StoryModules } from "@/shared/types"

  function setStoryDefaults(next: StoryModules) {
    storyDefaults.set(next)
  }
</script>

<div class="control-section-label">Defaults</div>
<div class="settings-modules">
  <StoryModulesPanel modules={$storyDefaults} setModules={setStoryDefaults} />
</div>

<div class="settings-bottom-pad"></div>

<style>
  .settings-modules {
    padding: 0.4rem 1rem 1rem;
  }
</style>
