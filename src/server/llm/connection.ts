import { getClient } from "./client.js"

export async function testConnection(): Promise<boolean> {
  try {
    await getClient().models.list()
    return true
  } catch {
    return false
  }
}
