import type { ChatCompletionMessageParam } from "@/llm/openai-types"
import { LlmRole } from "@/types/roles"
import { formatTemplate, getLlmStrings } from "@/utils/text/strings"

function isSystemMessage(msg: ChatCompletionMessageParam): boolean {
  return msg.role === LlmRole.System
}

export function injectOutputSchemaIntoMessages(
  messages: ChatCompletionMessageParam[],
  schemaName: string,
  jsonSchema: object,
): ChatCompletionMessageParam[] {
  const schemaText = JSON.stringify(jsonSchema)
  const schemaPrompt = getLlmStrings().schemaPrompt
  const injection: ChatCompletionMessageParam = {
    role: LlmRole.System,
    content: [
      formatTemplate(schemaPrompt.outputRequirements, { schemaName }),
      formatTemplate(schemaPrompt.draft07, { schemaText }),
    ].join(" "),
  }

  let insertAt = 0
  while (insertAt < messages.length && isSystemMessage(messages[insertAt]!)) insertAt += 1
  return [...messages.slice(0, insertAt), injection, ...messages.slice(insertAt)]
}
