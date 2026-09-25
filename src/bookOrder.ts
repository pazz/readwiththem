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
