import type { Context } from "hono"

export function badRequest(c: Context, message: string) {
  return c.json({ error: message }, 400)
}

export function notFound(c: Context, message: string) {
  return c.json({ error: message }, 404)
}

export function serverError(c: Context, message: string) {
  return c.json({ error: message }, 500)
}
