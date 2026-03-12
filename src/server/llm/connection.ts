import OpenAI from "openai"
import { getConnector } from "./client.js"

export async function testConnection(): Promise<boolean> {
  try {
    const client = new OpenAI({ baseURL: getConnector().url, apiKey: getConnector().api_key })
    await client.models.list()
    return true
  } catch {
    return false
  }
}
