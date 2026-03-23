import { UpstreamError } from "@/llm/io/upstream"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

function extractPayloadMessage(payload: unknown): string | null {
  const root = asRecord(payload)
  if (!root) return null
  const message = root.message
  if (typeof message === "string" && message.trim()) return message.trim()
  const errorObj = asRecord(root.error)
  const nested = errorObj?.message
  return typeof nested === "string" && nested.trim() ? nested.trim() : null
}

export function maybeLogOpenRouterResolvedModel(requestedModel: string, res: unknown): void {
  const root = asRecord(res)
  const model = root?.model
  const resolvedModel = typeof model === "string" && model.trim() ? model.trim() : null

  const provider = root?.provider
  const providerStr = typeof provider === "string" ? provider.trim() : null
  const providerObj = asRecord(provider)
  const providerName =
    providerStr ||
    (providerObj && typeof providerObj.name === "string" && providerObj.name.trim() ? providerObj.name.trim() : null) ||
    (providerObj && typeof providerObj.id === "string" && providerObj.id.trim() ? providerObj.id.trim() : null) ||
    null

  const shouldLog =
    (resolvedModel && resolvedModel !== requestedModel.trim()) || (providerName && providerName !== "") || false
  if (!shouldLog) return
  console.info(
    `[llm-openrouter] requested_model=${requestedModel}${resolvedModel ? ` resolved_model=${resolvedModel}` : ""}${providerName ? ` provider=${providerName}` : ""}`,
  )
}

export function maybeLogOpenRouterSupportedParametersForSelection(
  model: string,
  request: Record<string, unknown>,
  schemaName: string,
  supportedParams: string[] | null,
): void {
  console.info(formatOpenRouterRoutingDiagnostics(request, schemaName, model, supportedParams))
}

export function formatOpenRouterRoutingDiagnostics(
  request: Record<string, unknown>,
  schemaName: string,
  model: string,
  supportedParams: string[] | null,
): string {
  const safeKeys = Object.keys(request)
    .filter((k) => k !== "messages")
    .sort()

  const requestedKeys = safeKeys

  const provider = asRecord(request.provider)
  const requireParameters = provider ? provider.require_parameters : undefined

  const responseFormat = asRecord(request.response_format)
  const responseFormatType = responseFormat?.type
  const jsonSchema = responseFormat ? asRecord(responseFormat.json_schema) : null
  const jsonSchemaName = jsonSchema?.name
  const jsonSchemaStrict = jsonSchema?.strict

  const supportedParamSet = supportedParams && supportedParams.length > 0 ? new Set(supportedParams) : null
  const supportsStructuredOutputs = supportedParamSet ? supportedParamSet.has("structured_outputs") : null
  const supportsResponseFormat = supportedParamSet ? supportedParamSet.has("response_format") : null
  const supportedResponseFormats: string[] = []
  if (supportsResponseFormat === true) supportedResponseFormats.push("json_object")
  if (supportsResponseFormat === true && supportsStructuredOutputs === true)
    supportedResponseFormats.push("json_schema")

  const samplingKeys = [
    "max_completion_tokens",
    "max_tokens",
    "temperature",
    "top_p",
    "min_p",
    "top_k",
    "top_a",
    "seed",
    "presence_penalty",
    "frequency_penalty",
    "repetition_penalty",
  ] as const
  const samplingParts: string[] = []
  for (const key of samplingKeys) {
    const value = request[key]
    if (typeof value === "number" || typeof value === "boolean") samplingParts.push(`${key}=${value}`)
  }
  const logitBias = asRecord(request.logit_bias)
  if (logitBias) samplingParts.push(`logit_bias_keys=${Object.keys(logitBias).length}`)

  const notSupported =
    supportedParams && supportedParams.length > 0
      ? requestedKeys.filter((k) => k !== "model" && k !== "stream" && !supportedParams.includes(k))
      : []

  const parts: string[] = []
  parts.push(`[openrouter-routing] model=${model} schema=${schemaName}`)
  if (requireParameters !== undefined)
    parts.push(`[openrouter-routing] provider.require_parameters=${String(requireParameters)}`)
  if (responseFormatType || jsonSchemaName || jsonSchemaStrict !== undefined) {
    const strictStr = jsonSchemaStrict === undefined ? "unknown" : String(jsonSchemaStrict)
    parts.push(
      `[openrouter-routing] response_format=${String(responseFormatType)} json_schema.name=${String(
        jsonSchemaName,
      )} strict=${strictStr}`,
    )
  }
  parts.push(`[openrouter-routing] requested_keys=${requestedKeys.join(", ")}`)
  if (samplingParts.length > 0) parts.push(`[openrouter-routing] sampling=${samplingParts.join(", ")}`)
  if (supportedParams && supportedParams.length > 0) {
    parts.push(`[openrouter-routing] model_supported_parameters=${supportedParams.join(", ")}`)
    parts.push(
      `[openrouter-routing] supports_response_format=${String(supportsResponseFormat)} supports_structured_outputs=${String(
        supportsStructuredOutputs,
      )}`,
    )
    parts.push(
      `[openrouter-routing] supported_response_formats=${
        supportedResponseFormats.length > 0 ? supportedResponseFormats.join(", ") : "(none)"
      }`,
    )
  }
  if (notSupported.length > 0) {
    const filtered = notSupported.filter((k) => k !== "provider")
    if (filtered.length > 0) parts.push(`[openrouter-routing] keys_not_in_supported_parameters=${filtered.join(", ")}`)
  }

  if (responseFormatType === "json_schema" && supportsResponseFormat === true && supportsStructuredOutputs === false) {
    parts.push(
      `[openrouter-routing] hint=model_advertises_response_format_but_not_structured_outputs; json_schema may be unsupported for this model/provider`,
    )
  }
  return parts.join("\n")
}

export function shouldFallbackFromJsonSchema(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  if (!msg) return false
  return /(json_schema|structured|strict|response_format)/i.test(msg)
}

export function shouldDropResponseFormat(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  if (!msg) return false
  return /(response_format|unknown parameter|unrecognized|unsupported|additional property|not allowed|invalid)/i.test(
    msg,
  )
}

export function extractOpenRouterNoEndpointMessage(err: unknown): string | null {
  if (!(err instanceof UpstreamError)) return null
  if (err.status !== 404) return null
  const msg = extractPayloadMessage(err.bodyJson) ?? (typeof err.bodyText === "string" ? err.bodyText : "") ?? ""
  if (!msg.includes("No endpoints found that can handle the requested parameters")) return null
  return msg
}

export function shortErrorForLog(err: unknown, limit = 260): string {
  const raw = err instanceof Error ? err.message : String(err)
  const singleLine = raw.replace(/\s+/g, " ").trim()
  if (!singleLine) return "(unknown)"
  return singleLine.length > limit ? `${singleLine.slice(0, limit)}...` : singleLine
}

export function logOpenRouterJsonObjectFallback(
  schemaName: string,
  model: string,
  reason: string,
  details?: Record<string, unknown>,
): void {
  const parts: string[] = []
  parts.push(`[llm-openrouter] fallback=json_object schema=${schemaName} model=${model} reason=${reason}`)
  if (details) {
    for (const [k, v] of Object.entries(details)) {
      if (v === undefined) continue
      parts.push(`[llm-openrouter] ${k}=${String(v)}`)
    }
  }
  console.info(parts.join("\n"))
}
