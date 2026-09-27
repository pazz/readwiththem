import assert from 'node:assert'
import { fitWithin, normaliseBrightness, COVER_MAX_WIDTH, COVER_MAX_HEIGHT } from '../src/covers/coverImage.ts'

// Sizing: fits inside the box, keeps aspect, never enlarges.
assert.deepStrictEqual(fitWithin(600, 900), { width: 240, height: 360 }, 'a camera crop at cover aspect lands exactly on the limits')
assert.deepStrictEqual(fitWithin(1000, 1000), { width: 240, height: 240 }, 'a square is limited by width')
assert.deepStrictEqual(fitWithin(128, 192), { width: 128, height: 192 }, 'a small thumbnail is never scaled up')
const wide = fitWithin(2000, 500)
assert.ok(wide.width <= COVER_MAX_WIDTH && wide.height <= COVER_MAX_HEIGHT && Math.abs(wide.width / wide.height - 4) < 0.05, 'odd aspects still fit and keep their shape')

const pixels = (rgbs) => {
  const data = new Uint8ClampedArray(rgbs.length * 4)
  rgbs.forEach(([r, g, b], i) => data.set([r, g, b, 255], i * 4))
  return data
}
const meanLuma = (data) => {
  let s = 0
  for (let i = 0; i < data.length; i += 4) s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
  return s / (data.length / 4)
}

// A dim photo: everything between 10 and 70 out of 255, with some colour.
const dim = pixels(Array.from({ length: 1000 }, (_, i) => [10 + (i % 60), 8 + (i % 50), 5 + (i % 40)]))
const dimBefore = new Uint8ClampedArray(dim)
normaliseBrightness(dim)
assert.ok(meanLuma(dim) > meanLuma(dimBefore) * 2, `a dim photo is brightened substantially (${meanLuma(dimBefore).toFixed(0)} -> ${meanLuma(dim).toFixed(0)})`)
for (let i = 0; i < dim.length; i++) assert.ok(dim[i] >= dimBefore[i], 'no channel ever gets darker')
for (let i = 0; i < dim.length; i += 4) {
  if (dimBefore[i] > dimBefore[i + 2] + 5) assert.ok(dim[i] >= dim[i + 2], 'a warm pixel stays warm: channel order is preserved')
}

// A well-exposed photo spanning the full range barely changes.
const good = pixels(Array.from({ length: 1000 }, (_, i) => [(i * 7) % 256, (i * 13) % 256, (i * 3) % 256]))
const goodBefore = new Uint8ClampedArray(good)
normaliseBrightness(good)
assert.ok(Math.abs(meanLuma(good) - meanLuma(goodBefore)) < 6, 'a well-exposed photo is left close to how it was')

// Degenerate inputs don't throw.
normaliseBrightness(new Uint8ClampedArray(0))
const flat = pixels(Array.from({ length: 100 }, () => [0, 0, 0]))
normaliseBrightness(flat)

console.log('cover image checks passed')
