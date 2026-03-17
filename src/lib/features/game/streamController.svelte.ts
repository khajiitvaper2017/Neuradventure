export type StreamState = { narrative: string; background: string; scene: string; time: string }

export type StreamController = {
  state: StreamState
  follow: boolean
  start(requestId: string): void
  stop(): void
  handleScroll(): void
  jumpToLatest(): void
}

export function createStreamController(config: {
  enabled: () => boolean
  subscribe: (requestId: string, cb: (patch: unknown) => void) => () => void
  applyPatch: (state: StreamState, patch: unknown) => void
  isNearBottom: () => boolean
  scrollToBottom: (opts?: unknown) => void
  tick: () => Promise<void>
}): StreamController {
  let unsub: null | (() => void) = null
  let followScrollPending = false

  const stream = $state<StreamController>({
    state: { narrative: "", background: "", scene: "", time: "" },
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
    stream.state.narrative = ""
    stream.state.background = ""
    stream.state.scene = ""
    stream.state.time = ""
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
