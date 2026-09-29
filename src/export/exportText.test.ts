import { describe, expect, it } from 'vitest'
import { booksToMarkdown } from './exportText'

describe('booksToMarkdown', () => {
  it('says so when the selection is empty', () => {
    expect(booksToMarkdown('Our books', 'All time', [], { showCounts: true, showNotes: true })).toMatch(/No readings logged/)
  })

  const md = booksToMarkdown(
    "Freya's books",
    'September 2026',
    [
      { title: 'The Gruffalo', author: 'Julia Donaldson', notes: ['Loved the mouse voice', 'Read at bedtime'], count: 3 },
      { title: 'Untitled Doodle', notes: [], count: 1 },
    ],
    { showCounts: true, showNotes: true },
  )

  it("marks a book's language before its count", () => {
    const text = booksToMarkdown(
      'Books',
      'All time',
      [{ title: 'Der Grüffelo', author: 'Julia Donaldson', language: 'de', notes: [], count: 2 }],
      {
        showCounts: true,
        showNotes: false,
      },
    )
    expect(text).toContain('- Der Grüffelo — Julia Donaldson [DE] (×2)')
  })

  it('starts with a Setext heading and the period on its own line', () => {
    const lines = md.split('\n')
    expect(lines[0]).toBe("Freya's books")
    expect(lines[1]).toBe('='.repeat("Freya's books".length))
    expect(lines[2]).toBe('September 2026')
  })

  it('lists books with author and count, and notes nested beneath', () => {
    expect(md).not.toContain('<img')
    expect(md).toContain('- The Gruffalo — Julia Donaldson (×3)')
    expect(md).toContain('  - Loved the mouse voice')
    expect(md).toContain('  - Read at bedtime')
  })

  it('degrades cleanly without an author or notes, and never shows ×1', () => {
    expect(md).toContain('- Untitled Doodle')
    expect(md).not.toContain('undefined')
    expect(md).not.toContain('(×1)')
  })

  it('honours the counts and notes toggles', () => {
    expect(booksToMarkdown('x', 'y', [{ title: 'A', notes: [], count: 5 }], { showCounts: false, showNotes: true })).not.toContain('×')
    const noNotes = booksToMarkdown('x', 'y', [{ title: 'The Gruffalo', notes: ['Loved it'], count: 1 }], {
      showCounts: true,
      showNotes: false,
    })
    expect(noNotes).not.toContain('Loved it')
    expect(noNotes).toContain('The Gruffalo')
  })

  it('keeps non-ASCII text unchanged', () => {
    const out = booksToMarkdown('x', 'y', [{ title: 'Bébé — a memoir', notes: ['naïve café “quote”'], count: 1 }], {
      showCounts: false,
      showNotes: true,
    })
    expect(out).toContain('Bébé — a memoir')
    expect(out).toContain('naïve café “quote”')
  })
})
