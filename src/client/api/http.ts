function resolveApiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  if (!base) return path
  try {
    return new URL(path, base).toString()
  } catch {
    return path
  }
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = resolveApiUrl(path)
  let res: Response
  try {
    res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    })
  } catch (err) {
    console.error(`[api] Network error ${path}`, err)
    throw err
  }

  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  if (!res.ok) {
    console.error(`[api] ${res.status} ${res.statusText} ${path}`, body)
    const message =
      body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : res.statusText
    throw new ApiError(res.status, message)
  }

  return body as T
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}
