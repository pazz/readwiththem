import { describe, expect, it } from 'vitest'
import { sortReadings, summariseBooks, type BookOrder } from './bookOrder'

const titles: Record<string, string> = { a: 'Stick Man', b: 'The Gruffalo', c: 'Room on the Broom' }
const titleOf = (id: string) => titles[id]
const r = (editionId: string, date: string, note?: string) => ({ editionId, date, createdAt: date, note })
const readings = [r('a', '2026-09-01'), r('b', '2026-09-02'), r('b', '2026-09-05'), r('c', '2026-09-10'), r('b', '2026-09-03')]
const books = (order: BookOrder) => [...new Set(sortReadings(readings, titleOf, order).map((x) => x.editionId))]

describe('sortReadings', () => {
  it('orders books by latest reading, by count (ties by title), or by title', () => {
    expect(books('recent')).toEqual(['c', 'b', 'a'])
    expect(books('count')).toEqual(['b', 'c', 'a'])
    expect(books('title')).toEqual(['c', 'a', 'b'])
  })

  it('keeps a book’s readings together, newest first', () => {
    expect(
      sortReadings(readings, titleOf, 'title')
        .map((x) => x.editionId)
        .join(''),
    ).toBe('cabbb')
    const dates = sortReadings(readings, titleOf, 'count')
      .filter((x) => x.editionId === 'b')
      .map((x) => x.date)
    expect(dates).toEqual(['2026-09-05', '2026-09-03', '2026-09-02'])
  })

  it('returns a copy', () => expect(sortReadings(readings, titleOf, 'recent')).not.toBe(readings))
})

describe('summariseBooks', () => {
  it('gives one entry per book, in order, with notes oldest first', () => {
    const noted = [r('b', '2026-09-05', 'third'), r('a', '2026-09-01'), r('b', '2026-09-02', 'first'), r('b', '2026-09-03')]
    expect(summariseBooks(noted, titleOf, 'recent')).toEqual([
      { editionId: 'b', count: 3, notes: ['first', 'third'] },
      { editionId: 'a', count: 1, notes: [] },
    ])
  })
})
