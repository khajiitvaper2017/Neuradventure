import type { CustomFieldDef } from "@/shared/api-types"
import { createModal } from "@/utils/modalState.svelte.js"

export type WorldFieldsDraft = Record<string, string | string[]>

export interface WorldFieldsModalState {
  get open(): boolean
  get draft(): WorldFieldsDraft
  set draft(v: WorldFieldsDraft)
  get defs(): CustomFieldDef[]
  set defs(v: CustomFieldDef[])
  get saving(): boolean
  set saving(v: boolean)
  show(value: WorldFieldsDraft): void
  close(): void
}

export function createWorldFieldsModal(): WorldFieldsModalState {
  const modal = createModal<WorldFieldsDraft>(() => ({}))
  let defs = $state<CustomFieldDef[]>([])
  let saving = $state(false)

  return {
    get open() {
      return modal.open
    },
    get draft() {
      return modal.draft
    },
    set draft(v: WorldFieldsDraft) {
      modal.draft = v
    },
    get defs() {
      return defs
    },
    set defs(v: CustomFieldDef[]) {
      defs = v
    },
    get saving() {
      return saving
    },
    set saving(v: boolean) {
      saving = v
    },
    show(value: WorldFieldsDraft) {
      modal.show(value)
    },
    close() {
      modal.close()
    },
  }
}
