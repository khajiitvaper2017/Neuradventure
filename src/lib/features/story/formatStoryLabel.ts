export function formatStoryLabel(stories: ReadonlyArray<{ title: string; updated_at: string }>): string {
  if (!stories || stories.length === 0) return "No story yet"
  const sorted = [...stories].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const titles = sorted.map((s) => s.title).filter(Boolean)
  const shown = titles.slice(0, 2)
  const extra = titles.length - shown.length
  if (shown.length === 0) return "No story yet"
  return extra > 0 ? `${shown.join(", ")} +${extra} more` : shown.join(", ")
}
