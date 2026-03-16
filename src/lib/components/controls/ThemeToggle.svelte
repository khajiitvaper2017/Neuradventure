<script lang="ts">
  import { colorMode, type ColorMode } from "@/stores/settings"
  import { Monitor, Moon, Sun } from "@lucide/svelte"
  import { Button } from "@/components/ui/button"

  type AppliedMode = "light" | "dark"

  function iconFor(mode: ColorMode) {
    if (mode === "dark") return Moon
    if (mode === "light") return Sun
    return Monitor
  }

  function appliedMode(mode: ColorMode): AppliedMode {
    if (mode === "dark" || mode === "light") return mode
    if (typeof window === "undefined") return "dark"
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }

  function toggleTheme() {
    const current = $colorMode
    const applied = appliedMode(current)
    const next = applied === "dark" ? "light" : "dark"

    // Default is "system". First click switches to an explicit override and persists it.
    colorMode.set(next)
  }

  function resetToSystem(e: MouseEvent) {
    e.preventDefault()
    colorMode.set("system")
  }
</script>

<Button
  variant="ghost"
  size="icon"
  class="h-9 w-9 text-muted-foreground"
  onclick={toggleTheme}
  oncontextmenu={resetToSystem}
  aria-label="Toggle theme"
  title={$colorMode === "system" ? "Theme: System (right-click to reset)" : `Theme: ${$colorMode}`}
>
  {@const Icon = iconFor($colorMode)}
  <Icon size={16} strokeWidth={2} />
</Button>
