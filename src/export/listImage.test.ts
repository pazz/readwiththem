import { describe, expect, it } from 'vitest'
import { canvasHeight } from './listImage'

const rows = (n: number, notes: string[] = []) => Array.from({ length: n }, () => ({ notes }))
const withCovers = { showCovers: true, showNotes: false }
const withoutCovers = { showCovers: false, showNotes: false }

describe('canvasHeight', () => {
  it('leaves room for the heading even when empty', () => expect(canvasHeight(rows(0), withCovers)).toBeGreaterThan(0))
  it('grows with the number of rows', () => expect(canvasHeight(rows(10), withCovers)).toBeGreaterThan(canvasHeight(rows(1), withCovers)))
  it('gives covered rows more height than text rows', () =>
    expect(canvasHeight(rows(10), withCovers)).toBeGreaterThan(canvasHeight(rows(10), withoutCovers)))
  it('fits a note inside the cover height rather than growing the row', () =>
    expect(canvasHeight(rows(5, ['a note']), { showCovers: true, showNotes: true })).toBe(canvasHeight(rows(5), withCovers)))
  it('grows a text-only row for its note', () =>
    expect(canvasHeight(rows(5, ['a note']), { showCovers: false, showNotes: true })).toBeGreaterThan(canvasHeight(rows(5), withoutCovers)))
  it('ignores notes when they are switched off', () =>
    expect(canvasHeight(rows(5, ['a note']), withoutCovers)).toBe(canvasHeight(rows(5), withoutCovers)))
})
