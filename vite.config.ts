import { defineConfig, type Plugin } from "vite"
import { sveltekit } from "@sveltejs/kit/vite"
import { SvelteKitPWA } from "@vite-pwa/sveltekit"
import tailwindcss from "@tailwindcss/vite"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath, URL } from "node:url"

const DEV_LLM_LOG_ENDPOINT = "/__dev/llm-log"
const LOGS_DIR = fileURLToPath(new URL("./logs", import.meta.url))
const LAST_LLM_REQUEST_PATH = fileURLToPath(new URL("./logs/last-llm-request.json", import.meta.url))
const LAST_LLM_RESPONSE_PATH = fileURLToPath(new URL("./logs/last-llm-response.json", import.meta.url))

type DevLlmLogEntry = {
  id?: string
  timestamp?: string
  mode?: string
  request_name?: string
  schema_name?: string
  request?: unknown
  messages?: unknown
  sampling?: unknown
  stop?: unknown
  response?: unknown
  error?: unknown
}

async function readRequestBody(req: NodeJS.ReadableStream): Promise<string> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk))
    } else {
      chunks.push(chunk)
    }
  }
  return Buffer.concat(chunks).toString("utf8")
}

async function writeDevLlmLogs(entry: DevLlmLogEntry): Promise<void> {
  await mkdir(LOGS_DIR, { recursive: true })

  const requestLog = {
    id: entry.id ?? null,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    mode: entry.mode ?? null,
    request_name: entry.request_name ?? null,
    schema_name: entry.schema_name ?? null,
    request: entry.request ?? null,
    messages: entry.messages ?? [],
    sampling: entry.sampling ?? {},
    stop: entry.stop ?? null,
  }

  const responseLog = {
    id: entry.id ?? null,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    mode: entry.mode ?? null,
    request_name: entry.request_name ?? null,
    schema_name: entry.schema_name ?? null,
    response: entry.response ?? null,
    error: entry.error ?? null,
  }

  await Promise.all([
    writeFile(LAST_LLM_REQUEST_PATH, `${JSON.stringify(requestLog, null, 2)}\n`, "utf8"),
    writeFile(LAST_LLM_RESPONSE_PATH, `${JSON.stringify(responseLog, null, 2)}\n`, "utf8"),
  ])
}

function devLlmLogWriter(): Plugin {
  return {
    name: "dev-llm-log-writer",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== "POST") return next()

        let pathname = req.url ?? ""
        try {
          pathname = new URL(req.url ?? "", "http://localhost").pathname
        } catch {
          // Keep the raw path if URL parsing fails.
        }
        if (pathname !== DEV_LLM_LOG_ENDPOINT) return next()

        try {
          const raw = await readRequestBody(req)
          const parsed = JSON.parse(raw) as { entry?: DevLlmLogEntry }
          if (!parsed.entry || typeof parsed.entry !== "object") {
            res.statusCode = 400
            res.end("Invalid LLM log payload")
            return
          }

          await writeDevLlmLogs(parsed.entry)
          res.statusCode = 204
          res.end()
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          server.config.logger.warn(`[dev-llm-log] ${message}`)
          res.statusCode = 500
          res.end("Failed to persist LLM log")
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    devLlmLogWriter(),
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      registerType: "prompt",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Neuradventure",
        short_name: "Neuradventure",
        description: "Text-based adventure and chat with local saves.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#1c1c1c",
        theme_color: "#1c1c1c",
        icons: [
          {
            src: "/icons/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Ensure SPA deep-links still boot offline (and include sql.js WASM in precache).
        globPatterns: ["client/**/*.{js,css,ico,png,svg,webp,webmanifest,wasm}", "prerendered/**/*.{html,json}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.includes("/chat/completions") || url.pathname.includes("/completions"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true as const,
    forwardConsole: {
      unhandledErrors: true,
      logLevels: ["error", "warn", "info", "log", "debug"],
    },
  },
}))
