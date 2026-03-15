<script lang="ts">
  import * as Select from "@/components/ui/select"
  import { colorMode } from "@/stores/settings"

  const colorModeOptions = [
    { value: "system", label: "System" },
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
  ]
</script>

<div class="space-y-4">
  <div class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Appearance</div>

  <div class="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="space-y-1">
      <div class="text-sm font-medium text-foreground">Color mode</div>
      <div class="text-xs text-muted-foreground">Light, dark, or follow system preference.</div>
    </div>
    <div class="w-full sm:w-[18rem]">
      <Select.Root type="single" bind:value={$colorMode} items={colorModeOptions}>
        <Select.Trigger class="w-full" aria-label="Color mode">
          {colorModeOptions.find((o) => o.value === $colorMode)?.label ?? "Select…"}
        </Select.Trigger>
        <Select.Content>
          {#each colorModeOptions as option (option.value)}
            <Select.Item {...option} />
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  </div>
</div>
