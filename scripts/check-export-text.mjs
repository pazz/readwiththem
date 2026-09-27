import assert from 'node:assert'
import { booksToMarkdown } from '../src/export/exportText.ts'

const empty = booksToMarkdown('Our books', 'All time', [], { showCounts: true, showNotes: true })
assert.match(empty, /No readings logged/, 'an empty selection says so rather than rendering a bare heading')

const md = booksToMarkdown(
  "Freya's books",
  'September 2026',
  [
    { title: 'The Gruffalo', author: 'Julia Donaldson', notes: ['Loved the mouse voice', 'Read at bedtime'], count: 3 },
    { title: 'Untitled Doodle', notes: [], count: 1 },
  ],
  { showCounts: true, showNotes: true },
)
const linesOut = md.split('\n')
assert.strictEqual(linesOut[0], "Freya's books", 'first line is the title, unadorned')
assert.strictEqual(linesOut[1], '='.repeat("Freya's books".length), 'second line is a "=" underline the exact width of the title (Setext heading)')
assert.strictEqual(linesOut[2], 'September 2026', 'third line is the time period, on its own')

assert.ok(!md.includes('<img'), 'text export must never embed an image, regardless of any covers setting')
assert.ok(md.includes('- The Gruffalo — Julia Donaldson (×3)'), 'author and count included, plain dash-separated title (no bold markup)')
assert.ok(md.includes('  - Loved the mouse voice'), 'first note nested under its book')
assert.ok(md.includes('  - Read at bedtime'), 'second note also included — notes accumulate, not just the first')
assert.ok(md.includes('- Untitled Doodle') && !md.includes('undefined'), 'a book with no notes and no author degrades cleanly')
assert.ok(!md.includes('(×1)'), 'a single reading never shows a count suffix')

const noCounts = booksToMarkdown('x', 'y', [{ title: 'A', notes: [], count: 5 }], { showCounts: false, showNotes: true })
assert.ok(!noCounts.includes('×'), 'the counts toggle off must suppress every count, even when count > 1')

const noNotes = booksToMarkdown(
  'x',
  'y',
  [{ title: 'The Gruffalo', notes: ['Loved the mouse voice'], count: 1 }],
  { showCounts: true, showNotes: false },
)
assert.ok(!noNotes.includes('Loved the mouse voice'), 'the notes toggle off must suppress every note')
assert.ok(noNotes.includes('The Gruffalo'), 'the book itself still lists, just without its notes')

// Non-ASCII must round-trip untouched — this is plain JS string handling, not
// re-verifying the file-level BOM fix (which needs a real file on disk).
const unicode = booksToMarkdown('x', 'y', [{ title: 'Bébé — a memoir', notes: ['naïve café “quote”'], count: 1 }], { showCounts: false, showNotes: true })
assert.ok(unicode.includes('Bébé — a memoir'), 'accented characters and the em dash survive unchanged')
assert.ok(unicode.includes('naïve café “quote”'), 'unicode in notes survives unchanged')

console.log('export text checks passed')
