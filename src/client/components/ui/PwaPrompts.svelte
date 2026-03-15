<script lang="ts">
  import { onMount } from "svelte"
  import { pwa, clearPwaNeedRefresh } from "../../stores/pwa.js"

  type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
  }

  let installEvent = $state<BeforeInstallPromptEvent | null>(null)
  let dismissedInstall = $state(false)
  let showIosHelp = $state(false)

  const isIos = () => {
    if (typeof navigator === "undefined") return false
    const ua = navigator.userAgent.toLowerCase()
    return ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")
  }

  const isStandalone = () => {
    if (typeof window === "undefined") return false
    const mq = window.matchMedia?.("(display-mode: standalone)")
    const nav = navigator as unknown as { standalone?: boolean }
    return Boolean(mq?.matches || nav.standalone)
  }

  const canShowInstall = $derived(!!installEvent && !dismissedInstall)
  const canShowIosInstall = $derived(isIos() && !isStandalone() && !dismissedInstall)

  async function installPwa() {
    const ev = installEvent
    if (!ev) return
    try {
      await ev.prompt()
      await ev.userChoice
    } catch {
      // ignore
    } finally {
      installEvent = null
      dismissedInstall = true
    }
  }

  function dismissInstall() {
    dismissedInstall = true
    installEvent = null
    showIosHelp = false
  }

  function handleBackdropKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      dismissInstall()
    }
  }

  async function applyUpdate() {
    const state = $pwa
    try {
      await state.updateServiceWorker?.(true)
    } finally {
      clearPwaNeedRefresh()
    }
  }

  onMount(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      installEvent = e as BeforeInstallPromptEvent
    }
    const onAppInstalled = () => {
      installEvent = null
      dismissedInstall = true
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    window.addEventListener("appinstalled", onAppInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
      window.removeEventListener("appinstalled", onAppInstalled)
    }
  })
</script>

{#if $pwa.needRefresh}
  <div class="pwa-banner" role="status" aria-live="polite">
    <div class="pwa-banner__text">
      <div class="pwa-banner__title">Update available</div>
      <div class="pwa-banner__sub">Reload to get the latest version.</div>
    </div>
    <div class="pwa-banner__actions">
      <button class="btn-accent small" onclick={applyUpdate}>Update</button>
      <button class="btn-ghost small" onclick={clearPwaNeedRefresh}>Later</button>
    </div>
  </div>
{:else if canShowInstall}
  <div class="pwa-banner" role="status" aria-live="polite">
    <div class="pwa-banner__text">
      <div class="pwa-banner__title">Install Neuradventure</div>
      <div class="pwa-banner__sub">Use it like a standalone app.</div>
    </div>
    <div class="pwa-banner__actions">
      <button class="btn-accent small" onclick={installPwa}>Install</button>
      <button class="btn-ghost small" onclick={dismissInstall}>Dismiss</button>
    </div>
  </div>
{:else if canShowIosInstall}
  <div class="pwa-banner" role="status" aria-live="polite">
    <div class="pwa-banner__text">
      <div class="pwa-banner__title">Install on iOS</div>
      <div class="pwa-banner__sub">Use Share → Add to Home Screen.</div>
    </div>
    <div class="pwa-banner__actions">
      <button class="btn-ghost small" onclick={() => (showIosHelp = true)}>How</button>
      <button class="btn-ghost small" onclick={dismissInstall}>Dismiss</button>
    </div>
  </div>
{/if}

{#if showIosHelp}
  <div
    class="pwa-modal-backdrop"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) dismissInstall()
    }}
    onkeydown={handleBackdropKeydown}
  >
    <div class="pwa-modal" role="dialog" aria-modal="true" aria-label="Install on iOS" tabindex="-1">
      <div class="pwa-modal__title">Install on iPhone/iPad</div>
      <ol class="pwa-modal__steps">
        <li>Open the Share menu in Safari.</li>
        <li>Tap <span class="pwa-kbd">Add to Home Screen</span>.</li>
        <li>Confirm the name, then tap <span class="pwa-kbd">Add</span>.</li>
      </ol>
      <div class="pwa-modal__actions">
        <button class="btn-accent small" onclick={dismissInstall}>Got it</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .pwa-banner {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(12px + var(--safe-bottom));
    z-index: 250;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 0.85rem;
    background: color-mix(in srgb, var(--bg-raised) 92%, black);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--shadow-sm);
    backdrop-filter: blur(10px);
  }

  .pwa-banner__title {
    font-weight: 700;
    letter-spacing: 0.01em;
    color: var(--text);
    font-size: 0.86rem;
  }

  .pwa-banner__sub {
    margin-top: 2px;
    color: var(--text-dim);
    font-size: 0.78rem;
  }

  .pwa-banner__actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .pwa-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 260;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.5);
    animation: modalIn 0.15s var(--ease-out);
  }

  .pwa-modal {
    width: min(92vw, 440px);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow-md);
    padding: 1rem 1rem 0.9rem;
  }

  .pwa-modal__title {
    font-weight: 700;
    color: var(--text);
    margin-bottom: 0.5rem;
  }

  .pwa-modal__steps {
    color: var(--text-dim);
    padding-left: 1.15rem;
    line-height: 1.55;
    font-size: 0.9rem;
  }

  .pwa-kbd {
    font-family: var(--font-mono);
    font-size: 0.85em;
    padding: 0.08rem 0.35rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-input);
    color: var(--text-action);
    white-space: nowrap;
  }

  .pwa-modal__actions {
    margin-top: 0.9rem;
    display: flex;
    justify-content: flex-end;
  }

  @media (min-width: 700px) {
    .pwa-banner {
      left: auto;
      width: min(560px, 92vw);
      right: 16px;
    }
  }
</style>
