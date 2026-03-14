<script lang="ts">
  type TabDef<T extends string> = {
    value: T
    label: string
    disabled?: boolean
  }

  export let tabs: Array<TabDef<any>> = []
  export let value: string = ""
  export let ariaLabel: string | undefined = undefined
  export let disabled = false
  export let onChange: ((next: string) => void) | undefined = undefined

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
  class="seg-tabs"
  role="tablist"
  aria-label={ariaLabel}
  aria-disabled={disabled}
  style={`--seg-count:${Math.max(1, tabs.length)}; --seg-index:${activeIndex};`}
>
  <div class="seg-tabs__indicator" aria-hidden="true"></div>
  {#each tabs as t, idx (t.value)}
    <button
      type="button"
      class="seg-tabs__tab"
      class:seg-tabs__tab--active={t.value === value}
      disabled={disabled || !!t.disabled}
      role="tab"
      aria-selected={t.value === value}
      tabindex={t.value === value ? 0 : -1}
      bind:this={buttons[idx]}
      onclick={() => pick(t.value)}
      onkeydown={(e) => onTabKeydown(e, idx)}
    >
      {t.label}
    </button>
  {/each}
</div>

<style>
  .seg-tabs {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--seg-count), minmax(0, 1fr));
    gap: 0;
    padding: 0.25rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border);
    border-radius: 999px;
    overflow: hidden;
    flex-shrink: 0;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12) inset;
  }

  .seg-tabs__indicator {
    position: absolute;
    inset: 0;
    width: calc(100% / var(--seg-count));
    transform: translateX(calc(var(--seg-index) * 100%));
    border-radius: 999px;
    background:
      radial-gradient(120% 120% at 30% 30%, rgba(255, 255, 255, 0.07), transparent 60%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.12));
    border: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow:
      0 10px 22px rgba(0, 0, 0, 0.35),
      0 0 0 3px var(--accent-dim);
    transition: transform 220ms var(--ease-out);
    pointer-events: none;
    margin: 0.25rem;
  }

  .seg-tabs__tab {
    position: relative;
    z-index: 1;
    border: none;
    background: none;
    color: var(--text-dim);
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 600;
    padding: 0.55rem 0.7rem;
    letter-spacing: 0.02em;
    cursor: pointer;
    border-radius: 999px;
    transition:
      color 140ms var(--ease-out),
      opacity 140ms var(--ease-out);
  }

  .seg-tabs__tab:hover:not(:disabled) {
    color: var(--text);
  }

  .seg-tabs__tab--active {
    color: var(--accent);
  }

  .seg-tabs__tab:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--bg),
      0 0 0 4px var(--focus-ring);
  }

  .seg-tabs__tab:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
