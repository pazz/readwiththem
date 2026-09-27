import { describe, expect, it } from 'vitest'
import { chosenBook, initialLogForm, logFormReducer } from './logForm'

const start = initialLogForm('2026-09-27')
const gruffalo = { title: 'The Gruffalo', author: 'Julia Donaldson', isbn: '9781509804757', source: 'openlibrary' as const }

describe('logFormReducer', () => {
  it('selecting a book returns to the mode picker and clears the status', () => {
    const form = logFormReducer({ ...start, mode: 'search', status: 'Search failed' }, { type: 'select', book: gruffalo })
    expect(form).toMatchObject({ selected: gruffalo, mode: 'none', status: '' })
  })

  it('a missed scan switches to manual entry with the ISBN filled in', () => {
    const form = logFormReducer(start, { type: 'scanMissed', isbn: '123', status: 'not found' })
    expect(form).toMatchObject({ mode: 'manual', manual: { isbn: '123' }, status: 'not found' })
  })

  it('clears note and rating after a reading, and everything but the date after a new book', () => {
    const filled = { ...start, date: '2026-09-01', note: 'lovely', rating: '4', query: 'gruff', selected: gruffalo }
    expect(logFormReducer(filled, { type: 'logged' })).toMatchObject({ note: '', rating: '', query: 'gruff', selected: gruffalo })
    expect(logFormReducer(filled, { type: 'bookLogged' })).toEqual({ ...start, date: '2026-09-01' })
  })

  it('toggles the other children a reading is also for, and clears them once logged', () => {
    const both = logFormReducer(logFormReducer(start, { type: 'toggleAlso', childId: 'c2' }), { type: 'toggleAlso', childId: 'c3' })
    expect(both.alsoFor).toEqual(['c2', 'c3'])
    expect(logFormReducer(both, { type: 'toggleAlso', childId: 'c2' }).alsoFor).toEqual(['c3'])
    expect(logFormReducer(both, { type: 'logged' }).alsoFor).toEqual([])
  })

  it('keeps earlier results when a search fails', () => {
    const form = logFormReducer({ ...start, results: [gruffalo], searching: true }, { type: 'searchFinished', status: 'failed' })
    expect(form).toMatchObject({ results: [gruffalo], searching: false, status: 'failed' })
  })
})

describe('chosenBook', () => {
  it('prefers the selected book, then trimmed manual entry, else nothing', () => {
    expect(chosenBook({ ...start, selected: gruffalo })).toBe(gruffalo)
    expect(chosenBook({ ...start, manual: { title: ' Home Made ', author: ' ', isbn: '' } })).toEqual({
      title: 'Home Made',
      author: 'Unknown',
      isbn: undefined,
      source: 'manual',
    })
    expect(chosenBook(start)).toBeNull()
  })
})
