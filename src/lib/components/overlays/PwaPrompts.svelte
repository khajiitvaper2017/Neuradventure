<script lang="ts">
  import { onMount } from "svelte"
  import { pwa, clearPwaNeedRefresh } from "@/stores/pwa"
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog"
  import { Button } from "@/components/ui/button"

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
  <div
    class="fixed bottom-[calc(12px+env(safe-area-inset-bottom))] left-3 right-3 z-[250] flex items-center justify-between gap-3 rounded-xl border bg-background/85 p-3.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:left-auto sm:right-4 sm:w-[min(560px,92vw)]"
    role="status"
    aria-live="polite"
  >
    <div class="min-w-0">
      <div class="truncate text-sm font-semibold text-foreground">Update available</div>
      <div class="mt-0.5 truncate text-xs text-muted-foreground">Reload to get the latest version.</div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <Button size="sm" onclick={applyUpdate}>Update</Button>
      <Button size="sm" variant="outline" onclick={clearPwaNeedRefresh}>Later</Button>
    </div>
  </div>
{:else if canShowInstall}
  <div
    class="fixed bottom-[calc(12px+env(safe-area-inset-bottom))] left-3 right-3 z-[250] flex items-center justify-between gap-3 rounded-xl border bg-background/85 p-3.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:left-auto sm:right-4 sm:w-[min(560px,92vw)]"
    role="status"
    aria-live="polite"
  >
    <div class="min-w-0">
      <div class="truncate text-sm font-semibold text-foreground">Install Neuradventure</div>
      <div class="mt-0.5 truncate text-xs text-muted-foreground">Use it like a standalone app.</div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <Button size="sm" onclick={installPwa}>Install</Button>
      <Button size="sm" variant="outline" onclick={dismissInstall}>Dismiss</Button>
    </div>
  </div>
{:else if canShowIosInstall}
  <div
    class="fixed bottom-[calc(12px+env(safe-area-inset-bottom))] left-3 right-3 z-[250] flex items-center justify-between gap-3 rounded-xl border bg-background/85 p-3.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:left-auto sm:right-4 sm:w-[min(560px,92vw)]"
    role="status"
    aria-live="polite"
  >
    <div class="min-w-0">
      <div class="truncate text-sm font-semibold text-foreground">Install on iOS</div>
      <div class="mt-0.5 truncate text-xs text-muted-foreground">Use Share → Add to Home Screen.</div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <Button size="sm" variant="outline" onclick={() => (showIosHelp = true)}>How</Button>
      <Button size="sm" variant="outline" onclick={dismissInstall}>Dismiss</Button>
    </div>
  </div>
{/if}

{#if showIosHelp}
  <Dialog
    open={showIosHelp}
    onOpenChange={(next) => {
      if (!next && showIosHelp) dismissInstall()
    }}
  >
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>Install on iPhone/iPad</DialogTitle>
        <DialogDescription>Steps for adding Neuradventure to your home screen.</DialogDescription>
      </DialogHeader>
      <ol class="ml-5 list-decimal space-y-2 text-sm text-muted-foreground">
        <li>Open the Share menu in Safari.</li>
        <li>
          Tap
          <kbd class="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs text-foreground">Add to Home Screen</kbd
          >.
        </li>
        <li>
          Confirm the name, then tap <kbd
            class="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs text-foreground">Add</kbd
          >.
        </li>
      </ol>
      <DialogFooter class="mt-2">
        <Button onclick={dismissInstall}>Got it</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
{/if}
