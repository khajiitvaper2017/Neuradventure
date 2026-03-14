import { spawn } from "node:child_process"

type RunResult = { code: number; signal: NodeJS.Signals | null }

const isWindows = process.platform === "win32"
const npmCmd = isWindows ? "npm" : "npm"

const run = (args: string[], opts?: { env?: NodeJS.ProcessEnv }): Promise<RunResult> => {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCmd, args, {
      stdio: "inherit",
      env: opts?.env ?? process.env,
      shell: isWindows,
    })

    child.on("error", reject)
    child.on("exit", (code, signal) => {
      resolve({ code: code ?? 0, signal })
    })
  })
}

const main = async () => {
  const build = await run(["run", "build"])
  if (build.code !== 0) process.exit(build.code)

  const port = process.env.PORT ?? "3001"
  const host = process.env.HOST ?? "0.0.0.0"

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    PORT: port,
    HOST: host,
  }

  const child = spawn(npmCmd, ["run", "start"], { stdio: "inherit", env, shell: isWindows })

  const forward = (signal: NodeJS.Signals) => {
    try {
      child.kill(signal)
    } catch {
      // ignore
    }
  }

  process.once("SIGINT", () => forward("SIGINT"))
  process.once("SIGTERM", () => forward("SIGTERM"))
  process.once("SIGBREAK", () => forward("SIGBREAK"))

  child.on("exit", (code, _signal) => {
    process.exit(code ?? 0)
  })
}

void main()
