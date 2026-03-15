<script lang="ts">
  import StoryModulesPanel from "@/components/panels/StoryModulesPanel.svelte"
  import { storyDefaults } from "@/stores/settings"
  import type { StoryModules } from "@/shared/types"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

  function setStoryDefaults(next: StoryModules) {
    storyDefaults.set(next)
  }
</script>

<Card>
  <CardHeader>
    <CardTitle>Defaults</CardTitle>
    <CardDescription>Default story module settings for new stories.</CardDescription>
  </CardHeader>
  <CardContent>
    <StoryModulesPanel modules={$storyDefaults} setModules={setStoryDefaults} />
  </CardContent>
</Card>
