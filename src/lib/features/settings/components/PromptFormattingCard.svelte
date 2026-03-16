<script lang="ts">
  import * as Select from "@/components/ui/select"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import { Label } from "@/components/ui/label"
  import { sectionFormat } from "@/stores/settings"
  import { CodeXml } from "@lucide/svelte"

  const SECTION_FORMAT_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "markdown", label: "Markdown — ## Section" },
    { value: "xml", label: "XML — <section>…</section>" },
    { value: "equals", label: "Equals — === SECTION ===" },
    { value: "bbcode", label: "BBCode — [section]…[/section]" },
    { value: "colon", label: "Colon — Section:" },
    { value: "none", label: "None — no wrappers" },
  ]
</script>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <CodeXml class="size-4 text-muted-foreground" aria-hidden="true" />
      Prompt Formatting
    </CardTitle>
    <CardDescription>
      Controls how context sections are wrapped in prompts sent to the model. This does not change the required JSON
      output format.
    </CardDescription>
  </CardHeader>
  <CardContent class="space-y-2">
    <Label>Section wrapper format</Label>
    <Select.Root type="single" bind:value={$sectionFormat} items={SECTION_FORMAT_OPTIONS}>
      <Select.Trigger class="w-full" aria-label="Section wrapper format">
        {SECTION_FORMAT_OPTIONS.find((o) => o.value === $sectionFormat)?.label ?? "Select…"}
      </Select.Trigger>
      <Select.Content>
        {#each SECTION_FORMAT_OPTIONS as option (option.value)}
          <Select.Item {...option} />
        {/each}
      </Select.Content>
    </Select.Root>
    <div class="text-xs text-muted-foreground">Global setting (applies to all prompts).</div>
  </CardContent>
</Card>
