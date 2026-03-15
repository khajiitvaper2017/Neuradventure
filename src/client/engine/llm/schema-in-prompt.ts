import type { ChatCompletionMessageParam } from "./openai-types.js"

function isSystemMessage(msg: ChatCompletionMessageParam): boolean {
  return msg.role === "system"
}

export function injectOutputSchemaIntoMessages(
  messages: ChatCompletionMessageParam[],
  schemaName: string,
  jsonSchema: object,
): ChatCompletionMessageParam[] {
  const schemaText = JSON.stringify(jsonSchema)
  const injection: ChatCompletionMessageParam = {
    role: "system",
    content:
      `OUTPUT REQUIREMENTS (${schemaName}): You must output a single JSON object that validates against the following JSON Schema. ` +
      `Do not output the schema. Do not include any surrounding text. Do not add extra keys. ` +
      `JSON_SCHEMA_DRAFT_07:${schemaText}`,
  }

  let insertAt = 0
  while (insertAt < messages.length && isSystemMessage(messages[insertAt]!)) insertAt += 1
  return [...messages.slice(0, insertAt), injection, ...messages.slice(insertAt)]
}
