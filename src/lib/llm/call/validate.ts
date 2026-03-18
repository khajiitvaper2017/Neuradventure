import { z } from "zod"
import { parseJsonFromContent } from "@/llm/io/parse"

function formatZodIssues(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)"
    return `${path}: ${issue.message}`
  })
  return issues.join("; ")
}

export function parseAndValidateJson<TSchema extends z.ZodTypeAny>(args: {
  schemaName: string
  zodSchema: TSchema
  responseContent: string
}): { parsed: z.infer<TSchema>; parsedCandidate: unknown } {
  const parsedRaw = parseJsonFromContent(args.responseContent, args.schemaName)
  const parsedCandidate = parsedRaw
  const validated = args.zodSchema.safeParse(parsedCandidate)
  if (!validated.success) {
    const issues = formatZodIssues(validated.error)
    throw new Error(`LLM returned JSON that failed validation for ${args.schemaName}: ${issues}`)
  }
  return { parsed: validated.data, parsedCandidate }
}
