import assert from 'node:assert'
import { sortReadings } from '../src/bookOrder.ts'

const titles = { a: 'Stick Man', b: 'The Gruffalo', c: 'Room on the Broom' }
const r = (editionId, date, createdAt = date) => ({ editionId, date, createdAt })
const readings = [
  r('a', '2026-09-01'),
  r('b', '2026-09-02'),
  r('b', '2026-09-05'),
  r('c', '2026-09-10'),
  r('b', '2026-09-03'),
]
const titleOf = (id) => titles[id]
const books = (order) => [...new Set(sortReadings(readings, titleOf, order).map((x) => x.editionId))]

assert.deepStrictEqual(books('recent'), ['c', 'b', 'a'], 'recent: by each book\'s latest reading')
assert.deepStrictEqual(books('count'), ['b', 'c', 'a'], 'count: most read first, ties by title (Room before Stick)')
assert.deepStrictEqual(books('title'), ['c', 'a', 'b'], 'title: A to Z')

const gruffaloDates = sortReadings(readings, titleOf, 'count').filter((x) => x.editionId === 'b').map((x) => x.date)
assert.deepStrictEqual(gruffaloDates, ['2026-09-05', '2026-09-03', '2026-09-02'], 'within a book, newest reading first')

const grouped = sortReadings(readings, titleOf, 'title').map((x) => x.editionId).join('')
assert.strictEqual(grouped, 'cabbb', 'a book\'s readings sit together rather than interleaving')

assert.notStrictEqual(sortReadings(readings, titleOf, 'recent'), readings, 'returns a copy, never sorts the caller\'s array in place')

console.log('book order checks passed')
