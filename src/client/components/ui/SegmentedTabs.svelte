<script lang="ts">
  type TabDef<T extends string> = {
    value: T
    label: string
    disabled?: boolean
    badge?: string | number
  }

  export let tabs: Array<TabDef<any>> = []
  export let value: string = ""
  export let ariaLabel: string | undefined = undefined
  export let disabled = false
  export let onChange: ((next: string) => void) | undefined = undefined
  export let className: string = ""
  export let variant: "default" | "nav" = "default"
  export let wrap = false
  export let stretch = false

  let buttons: Array<HTMLButtonElement | null> = []

  $: activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.value === value),
  )

  function pick(next: string) {
    if (disabled) return
    const def = tabs.find((t) => t.value === next)
    if (!def || def.disabled) return
    value = next
    onChange?.(next)
  }

  function focusIndex(nextIndex: number) {
    buttons[nextIndex]?.focus()
  }

  function findNextEnabledIndex(from: number, dir: 1 | -1): number {
    if (tabs.length === 0) return -1
    let idx = from
    for (let i = 0; i < tabs.length; i++) {
      idx = (idx + dir + tabs.length) % tabs.length
      const def = tabs[idx]
      if (def && !def.disabled) return idx
    }
    return from
  }

  function onTabKeydown(e: KeyboardEvent, idx: number) {
    if (disabled) return
    if (e.key === "ArrowRight") {
      e.preventDefault()
      const next = findNextEnabledIndex(idx, 1)
      focusIndex(next)
      return
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault()
      const prev = findNextEnabledIndex(idx, -1)
      focusIndex(prev)
      return
    }
    if (e.key === "Home") {
      e.preventDefault()
      const first = tabs.findIndex((t) => !t.disabled)
      if (first >= 0) focusIndex(first)
      return
    }
    if (e.key === "End") {
      e.preventDefault()
      for (let i = tabs.length - 1; i >= 0; i--) {
        if (!tabs[i]?.disabled) {
          focusIndex(i)
          break
        }
      }
      return
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      pick(tabs[idx]?.value ?? "")
    }
  }
</script>

<div
  class="mode-group seg-tabs {className}"
  class:seg-tabs--nav={variant === "nav"}
  class:seg-tabs--wrap={wrap}
  class:seg-tabs--stretch={stretch}
  role="tablist"
  aria-label={ariaLabel}
  aria-disabled={disabled}
  style={`--seg-count:${Math.max(1, tabs.length)}; --seg-index:${activeIndex};`}
>
  <div class="seg-tabs__indicator" aria-hidden="true"></div>
  {#each tabs as t, idx (t.value)}
    <button
      type="button"
      class="mode-pill seg-tabs__tab"
      class:active={t.value === value}
      disabled={disabled || !!t.disabled}
      role="tab"
      aria-selected={t.value === value}
      tabindex={t.value === value ? 0 : -1}
      bind:this={buttons[idx]}
      onclick={() => pick(t.value)}
      onkeydown={(e) => onTabKeydown(e, idx)}
    >
      <span class="seg-tabs__label">{t.label}</span>
      {#if t.badge !== undefined}
        <span class="seg-tabs__badge">{t.badge}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .seg-tabs {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--seg-count), minmax(0, 1fr));
    gap: 0.25rem;
    padding: 0.2rem 0.25rem;
    max-width: 100%;
  }

  .seg-tabs__indicator {
    position: absolute;
    inset: 0;
    width: calc(100% / var(--seg-count));
    transform: translateX(calc(var(--seg-index) * 100%));
    margin: 0.2rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
    box-shadow:
      0 10px 20px rgba(0, 0, 0, 0.28),
      0 0 0 2px color-mix(in srgb, var(--accent) 12%, transparent);
    transition: transform 220ms var(--ease-out);
    pointer-events: none;
  }

  .seg-tabs__tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    white-space: nowrap;
    border: 1px solid transparent;
    position: relative;
    z-index: 1;
  }

  .seg-tabs__label {
    min-width: 0;
  }

  .seg-tabs__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.4rem;
    height: 1.15rem;
    padding: 0 0.35rem;
    border-radius: var(--radius-pill);
    font-size: 0.7rem;
    letter-spacing: 0.02em;
    color: var(--text-action);
    border: 1px solid var(--border);
    background: var(--bg-action);
  }

  .seg-tabs__tab.active {
    background: none;
    color: var(--accent);
  }

  .seg-tabs__tab:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--bg),
      0 0 0 4px var(--focus-ring);
  }

  .seg-tabs--wrap {
    display: flex;
    flex-wrap: wrap;
  }

  .seg-tabs--wrap .seg-tabs__indicator {
    display: none;
  }

  .seg-tabs--wrap .seg-tabs__tab.active {
    background: color-mix(in srgb, var(--accent) 10%, var(--bg-action));
    border-color: color-mix(in srgb, var(--accent) 26%, var(--border));
  }

  .seg-tabs--stretch {
    width: 100%;
  }
  .seg-tabs--stretch .seg-tabs__tab {
    flex: 1;
  }

  .seg-tabs--nav .seg-tabs__tab {
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    padding: 0.35rem 0.75rem;
    min-height: 34px;
    white-space: normal;
    text-align: center;
  }
</style>
