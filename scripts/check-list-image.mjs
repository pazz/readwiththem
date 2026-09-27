import assert from 'node:assert'
import { register } from 'node:module'

register('./ts-extension-hook.mjs', import.meta.url)

const { canvasHeight } = await import('../src/export/listImage.ts')

const rows = (n, notes = []) => Array.from({ length: n }, () => ({ notes }))
const withCovers = { showCovers: true, showNotes: false }
const withoutCovers = { showCovers: false, showNotes: false }

assert.ok(canvasHeight(rows(0), withCovers) > 0, 'an empty list still gets a canvas tall enough for the heading and empty message')
assert.ok(canvasHeight(rows(10), withCovers) > canvasHeight(rows(1), withCovers), 'height grows with more rows')
assert.ok(canvasHeight(rows(10), withCovers) > canvasHeight(rows(10), withoutCovers), 'rows with covers take more vertical space than text-only rows')

// With a cover, a note tucks into the cover's own height (below the title,
// never past its bottom edge) rather than growing the row — the row height
// must stay exactly the same whether or not notes are shown.
assert.strictEqual(
  canvasHeight(rows(5, ['a note']), { showCovers: true, showNotes: true }),
  canvasHeight(rows(5), withCovers),
  'a note never grows a covered row — it fits inside the cover height instead',
)

// Without a cover there's nothing to tuck the note under, so the row does grow.
assert.ok(
  canvasHeight(rows(5, ['a note']), { showCovers: false, showNotes: true }) > canvasHeight(rows(5), withoutCovers),
  'a row with a note takes more space once the notes toggle is on, with no cover to hide it under',
)
assert.strictEqual(
  canvasHeight(rows(5, ['a note']), { showCovers: false, showNotes: false }),
  canvasHeight(rows(5), withoutCovers),
  'notes present but the toggle off take no extra space',
)

console.log('list image checks passed')
