import type { TurnVariantSummary } from "@/types/types"
import { turns as turnsService } from "@/services/turns"

export interface TurnVariantsState {
  variants: TurnVariantSummary[]
  activeVariantId: number | null
  turnId: number | null
  loading: boolean
  load(turnId: number, force?: boolean): Promise<void>
  clear(): void
}

export function createTurnVariantsState(): TurnVariantsState {
  let state = $state<TurnVariantsState>({
    variants: [],
    activeVariantId: null,
    turnId: null,
    loading: false,
    load: async () => {},
    clear: () => {},
  })

  state.clear = () => {
    state.variants = []
    state.activeVariantId = null
    state.turnId = null
  }

  state.load = async (turnId: number, force = false) => {
    if (!turnId || state.loading) return
    if (!force && state.turnId === turnId && state.variants.length > 0) return

    state.loading = true
    try {
      const res = await turnsService.variants(turnId)
      state.variants = res.variants
      state.activeVariantId = res.active_variant_id
      state.turnId = turnId
    } catch (err) {
      console.error("Failed to load turn variants", err)
      state.variants = []
      state.activeVariantId = null
      state.turnId = turnId
    } finally {
      state.loading = false
    }
  }

  return state
}
