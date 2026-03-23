export type PickFileOptions = {
  accept: string
}

export async function pickFile(options: PickFileOptions): Promise<File | null> {
  if (typeof document === "undefined" || typeof window === "undefined") return null

  return await new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = options.accept
    let settled = false

    const cleanup = () => {
      window.removeEventListener("focus", onFocus)
      input.onchange = null
      input.remove()
    }

    input.onchange = () => {
      if (settled) return
      settled = true
      const file = input.files?.[0] ?? null
      cleanup()
      resolve(file)
    }

    // If the user cancels the picker, `change` typically won't fire. The browser
    // re-focuses the window after closing the dialog — use that as a best-effort
    // cancellation signal.
    const onFocus = () => {
      window.setTimeout(() => {
        if (settled) return
        const file = input.files?.[0] ?? null
        if (file) return
        settled = true
        cleanup()
        resolve(null)
      }, 250)
    }
    window.addEventListener("focus", onFocus, { once: true })

    input.click()
  })
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  if (typeof FileReader === "undefined") throw new Error("FileReader is not available")

  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"))
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.readAsDataURL(file)
  })
}
