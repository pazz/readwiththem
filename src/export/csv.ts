import type { Child, Edition, ReadingSession } from '../types'

// One row per reading, every field quoted.
export function sessionsToCSV(sessions: ReadingSession[], children: Child[], editions: Edition[]): string {
  const childById = new Map(children.map((c) => [c.id, c]))
  const editionById = new Map(editions.map((e) => [e.id, e]))
  const header = ['date', 'child', 'title', 'author', 'rating', 'note']
  const rows = sessions.map((s) => [
    s.date,
    childById.get(s.childId)?.name ?? '',
    editionById.get(s.editionId)?.title ?? '',
    editionById.get(s.editionId)?.author ?? '',
    s.rating?.toString() ?? '',
    s.note ?? '',
  ])
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\n')
}
