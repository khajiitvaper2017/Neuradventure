<script lang="ts">
  import { onMount, tick } from "svelte"

  type SelectOption = {
    value: any
    label: string
    disabled?: boolean
  }

  export let id: string | undefined = undefined
  export let ariaLabel: string | undefined = undefined
  export let placeholder = "Select…"
  export let disabled = false
  export let options: SelectOption[] = []
  export let value: any = ""
  export let width: string | undefined = undefined
  export let className = ""
  export let onChange: ((next: any) => void) | undefined = undefined

  let open = false
  let activeIndex = -1
  let rootEl: HTMLDivElement | null = null
  let menuEl: HTMLDivElement | null = null
  let triggerEl: HTMLButtonElement | null = null

  $: selected = options.find((o) => o.value === value) ?? null

  function setActiveToSelectedOrFirst() {
    const selectedIndex = options.findIndex((o) => o.value === value && !o.disabled)
    if (selectedIndex >= 0) {
      activeIndex = selectedIndex
      return
    }
    const firstEnabled = options.findIndex((o) => !o.disabled)
    activeIndex = firstEnabled >= 0 ? firstEnabled : -1
  }

  async function openMenu() {
    if (disabled) return
    open = true
    setActiveToSelectedOrFirst()
    await tick()
    menuEl?.focus()
  }

  function closeMenu() {
    open = false
  }

  async function toggleMenu() {
    if (open) closeMenu()
    else await openMenu()
  }

  function pickIndex(index: number) {
    const opt = options[index]
    if (!opt || opt.disabled) return
    value = opt.value
    onChange?.(opt.value)
    closeMenu()
    void tick().then(() => triggerEl?.focus())
  }

  function moveActive(delta: number) {
    if (options.length === 0) return
    let idx = activeIndex
    for (let i = 0; i < options.length; i++) {
      idx = (idx + delta + options.length) % options.length
      if (!options[idx]?.disabled) {
        activeIndex = idx
        return
      }
    }
  }

  async function onTriggerKeydown(e: KeyboardEvent) {
    if (disabled) return
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      await toggleMenu()
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      await openMenu()
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      await openMenu()
      return
    }
  }

  function onMenuKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault()
      closeMenu()
      void tick().then(() => triggerEl?.focus())
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      moveActive(1)
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      moveActive(-1)
      return
    }
    if (e.key === "Home") {
      e.preventDefault()
      activeIndex = options.findIndex((o) => !o.disabled)
      return
    }
    if (e.key === "End") {
      e.preventDefault()
      for (let i = options.length - 1; i >= 0; i--) {
        if (!options[i]?.disabled) {
          activeIndex = i
          break
        }
      }
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      if (activeIndex >= 0) pickIndex(activeIndex)
      return
    }
  }

  onMount(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (rootEl && !rootEl.contains(t)) {
        closeMenu()
      }
    }
    const onDocKeydown = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === "Escape") {
        e.preventDefault()
        closeMenu()
        void tick().then(() => triggerEl?.focus())
      }
    }
    document.addEventListener("pointerdown", onDocPointerDown)
    document.addEventListener("keydown", onDocKeydown)
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown)
      document.removeEventListener("keydown", onDocKeydown)
    }
  })
</script>

<div
  class={"select " + className}
  style={width ? `--select-width: ${width};` : undefined}
  bind:this={rootEl}
  data-open={open ? "true" : "false"}
>
  <button
    class="select-trigger"
    type="button"
    bind:this={triggerEl}
    {id}
    aria-label={ariaLabel}
    aria-haspopup="listbox"
    aria-expanded={open}
    {disabled}
    onclick={toggleMenu}
    onkeydown={onTriggerKeydown}
  >
    <span class={"select-value" + (!selected ? " select-value--placeholder" : "")}>
      {selected?.label ?? placeholder}
    </span>
  </button>

  {#if open}
    <div class="select-menu" role="listbox" tabindex="-1" bind:this={menuEl} onkeydown={onMenuKeydown}>
      {#each options as opt, i (opt.value)}
        <button
          type="button"
          class={"select-option" + (i === activeIndex ? " active" : "")}
          role="option"
          aria-selected={opt.value === value}
          disabled={opt.disabled}
          onclick={() => pickIndex(i)}
          onmouseenter={() => {
            if (!opt.disabled) activeIndex = i
          }}
        >
          {opt.label}
        </button>
      {/each}
    </div>
  {/if}
</div>
