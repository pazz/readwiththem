export type BookOrder = 'recent' | 'count' | 'title'

interface Reading {
  editionId: string
  date: string
  createdAt: string
}

/**
 * Orders readings so that each book's readings sit together (for "count" and
 * "title") and the books come out in the chosen order. The export derives its
 * book order from the first appearance of each book in this list, so History
 * and every export agree without keeping two sorts in step:
 *   recent: newest reading first, so books by their latest reading;
 *   count:  most-read book first, ties by title;
 *   title:  A to Z.
 * Within a book, readings stay newest first.
 */
export function sortReadings<T extends Reading>(readings: T[], titleOf: (editionId: string) => string, order: BookOrder): T[] {
  const counts = new Map<string, number>()
  for (const r of readings) counts.set(r.editionId, (counts.get(r.editionId) ?? 0) + 1)
  return [...readings].sort((a, b) => {
    if (order === 'count') {
      const byCount = counts.get(b.editionId)! - counts.get(a.editionId)!
      if (byCount) return byCount
    }
    if (order !== 'recent') {
      // editionId as a last resort keeps two editions with the same title apart.
      const byTitle = titleOf(a.editionId).localeCompare(titleOf(b.editionId)) || a.editionId.localeCompare(b.editionId)
      if (byTitle) return byTitle
    }
    return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
  })
}

interface NotedReading extends Reading {
  note?: string
}

export interface BookSummary {
  editionId: string
  count: number
  notes: string[]
}

/**
 * One entry per book, not per reading, in the chosen order: a re-read shows a
 * "×N" count instead of repeating the book. Notes accumulate oldest first, so
 * they read as a diary whatever order the books themselves are in.
 */
export function summariseBooks(readings: NotedReading[], titleOf: (editionId: string) => string, order: BookOrder): BookSummary[] {
  const books = new Map<string, BookSummary>()
  for (const r of sortReadings(readings, titleOf, order)) {
    if (!books.has(r.editionId)) books.set(r.editionId, { editionId: r.editionId, count: 0, notes: [] })
  }
  const chronological = [...readings].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  for (const r of chronological) {
    const book = books.get(r.editionId)!
    book.count += 1
    if (r.note) book.notes.push(r.note)
  }
  return [...books.values()]
}
