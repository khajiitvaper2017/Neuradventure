export type FieldKind = "input" | "textarea"

export type EditField = {
  id: string
  label: string
  kind: FieldKind
  value: string
  onInput: (value: string) => void
}
