import assert from 'node:assert'
import { chooseGrid, POSTER_WIDTH, POSTER_HEIGHT } from '../src/poster.ts'

// Every cover must fit on the single page — the whole point of the canvas render.
for (let n = 1; n <= 200; n++) {
  const { cols, rows } = chooseGrid(n)
  assert.ok(cols >= 1 && rows >= 1, `grid must be non-empty for ${n}`)
  assert.ok(cols * rows >= n, `grid ${cols}x${rows} cannot hold ${n} covers`)
}

// One cover fills the sheet; five settle into a 3x2 that stays roughly portrait.
assert.deepStrictEqual(chooseGrid(1), { cols: 1, rows: 1 })
assert.deepStrictEqual(chooseGrid(5), { cols: 3, rows: 2 })

// Tiles should never degenerate into slivers or letterbox strips.
for (const n of [2, 3, 5, 12, 30, 97]) {
  const { cols, rows } = chooseGrid(n)
  const aspect = POSTER_WIDTH / cols / (POSTER_HEIGHT / rows)
  assert.ok(aspect > 0.25 && aspect < 2.5, `tile aspect ${aspect.toFixed(2)} out of range for ${n}`)
}

console.log('poster grid checks passed')
