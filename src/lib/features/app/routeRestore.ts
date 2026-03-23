import type { Screen } from "@/stores/router"

type RestoreArgs = {
  bootstrapped: boolean
  activeScreen: Screen
  routeId: number | null
  currentId: number | null
  isRestoring: () => boolean
  setRestoring: (next: boolean) => void
  load: (id: number) => Promise<void>
  onError: () => void
}

export type RouteRestorer = {
  maybeRestoreStory: (args: RestoreArgs) => Promise<void>
  maybeRestoreChat: (args: RestoreArgs) => Promise<void>
}

export function createRouteRestorer(): RouteRestorer {
  let storyToken = 0
  let chatToken = 0

  const maybeRestore = async (
    args: RestoreArgs,
    expectedScreen: Screen,
    token: { get: () => number; bump: () => number },
  ): Promise<void> => {
    if (!args.bootstrapped) return
    if (args.activeScreen !== expectedScreen) return
    if (!args.routeId) return
    if (args.currentId === args.routeId) return
    if (args.isRestoring()) return

    const currentToken = token.bump()
    args.setRestoring(true)
    try {
      await args.load(args.routeId)
    } catch {
      args.onError()
    } finally {
      if (token.get() === currentToken) args.setRestoring(false)
    }
  }

  const story = {
    get: () => storyToken,
    bump: () => (storyToken += 1),
  }
  const chat = {
    get: () => chatToken,
    bump: () => (chatToken += 1),
  }

  return {
    maybeRestoreStory: (args) => maybeRestore(args, "game", story),
    maybeRestoreChat: (args) => maybeRestore(args, "chat", chat),
  }
}
