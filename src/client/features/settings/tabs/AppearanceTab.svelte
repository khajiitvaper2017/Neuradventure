<script lang="ts">
  import Select from "../../../components/ui/Select.svelte"
  import { colorScheme, design, textJustify, theme } from "../../../stores/settings.js"

  const themeOptions = [
    { value: "default", label: "Default — Dark gray background" },
    { value: "amoled", label: "AMOLED — Pure black (OLED)" },
  ]
  const designOptions = [
    { value: "classic", label: "Classic — Spectral + DM Sans" },
    { value: "roboto", label: "Roboto — clean sans-serif" },
  ]
  const colorSchemeOptions = [
    { value: "gold", label: "Gold — Warm, classic accent" },
    { value: "emerald", label: "Emerald — Cool green accent" },
    { value: "sapphire", label: "Sapphire — Blue with strong contrast" },
    { value: "crimson", label: "Crimson — Bold red accent" },
  ]
</script>

<div class="control-section-label">Theme</div>
<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Theme</span>
    <span class="control-row-sub">Overall background tone</span>
  </span>
  <Select bind:value={$theme} options={themeOptions} ariaLabel="Theme" />
</label>

<div class="divider"></div>

<div class="control-section-label">Typography</div>
<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Typography</span>
    <span class="control-row-sub">Fonts for story and UI</span>
  </span>
  <Select bind:value={$design} options={designOptions} ariaLabel="Typography" />
</label>

<div class="divider"></div>

<div class="control-section-label">Color Scheme</div>
<label class="control-row control-row--input">
  <span class="control-row-text">
    <span class="control-row-title">Accent</span>
    <span class="control-row-sub">Highlight color for buttons and UI</span>
  </span>
  <Select bind:value={$colorScheme} options={colorSchemeOptions} ariaLabel="Accent color" />
</label>

<div class="divider"></div>

<div class="control-section-label">Text Layout</div>
<label class="control-row">
  <span class="control-row-text">
    <span class="control-row-title">Justify text</span>
    <span class="control-row-sub">Align paragraph edges for a book-like look</span>
  </span>
  <input type="checkbox" bind:checked={$textJustify} />
</label>
