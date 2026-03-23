export type StreamController<TState> = {
  state: TState
  follow: boolean
  start(requestId: string): void
  stop(): void
  handleScroll(): void
  jumpToLatest(): void
}

export function createStreamController<TState>(config: {
  enabled: () => boolean
  subscribe: (requestId: string, cb: (patch: unknown) => void) => () => void
  applyPatch: (state: TState, patch: unknown) => void
  seed: () => TState
  reset: (state: TState) => void
  isNearBottom: () => boolean
  scrollToBottom: (opts?: { smooth?: boolean }) => void
  tick: () => Promise<void>
}): StreamController<TState> {
  let unsub: null | (() => void) = null
  let followScrollPending = false

  const stream = $state<StreamController<TState>>({
    state: config.seed(),
    follow: true,
    start: () => {},
    stop: () => {},
    handleScroll: () => {},
    jumpToLatest: () => {},
  })

  function scheduleFollowScroll() {
    if (!stream.follow) return
    if (followScrollPending) return
    followScrollPending = true
    config.tick().then(() => {
      followScrollPending = false
      config.scrollToBottom()
    })
  }

  stream.stop = () => {
    unsub?.()
    unsub = null
    config.reset(stream.state)
  }

  stream.start = (requestId: string) => {
    stream.stop()
    stream.follow = true
    if (!config.enabled()) return

    unsub = config.subscribe(requestId, (patch) => {
      config.applyPatch(stream.state, patch)
      scheduleFollowScroll()
    })
  }

  stream.handleScroll = () => {
    stream.follow = config.isNearBottom()
  }

  stream.jumpToLatest = () => {
    stream.follow = true
    config.tick().then(() => config.scrollToBottom({ smooth: true }))
  }

  return stream
}
