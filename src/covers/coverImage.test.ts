import { describe, expect, it } from 'vitest'
import { fitWithin, normaliseBrightness, COVER_MAX_WIDTH, COVER_MAX_HEIGHT } from './coverImage'

const pixels = (rgbs: number[][]) => {
  const data = new Uint8ClampedArray(rgbs.length * 4)
  rgbs.forEach(([r, g, b], i) => data.set([r, g, b, 255], i * 4))
  return data
}
const meanLuma = (data: Uint8ClampedArray) => {
  let s = 0
  for (let i = 0; i < data.length; i += 4) s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
  return s / (data.length / 4)
}

describe('fitWithin', () => {
  it('fits inside the limits, keeping the aspect ratio', () => {
    expect(fitWithin(600, 900)).toEqual({ width: 240, height: 360 })
    expect(fitWithin(1000, 1000)).toEqual({ width: 240, height: 240 })
    const wide = fitWithin(2000, 500)
    expect(wide.width).toBeLessThanOrEqual(COVER_MAX_WIDTH)
    expect(wide.height).toBeLessThanOrEqual(COVER_MAX_HEIGHT)
    expect(wide.width / wide.height).toBeCloseTo(4, 1)
  })

  it('never scales up', () => expect(fitWithin(128, 192)).toEqual({ width: 128, height: 192 }))
})

describe('normaliseBrightness', () => {
  it('brightens a dim photo without darkening or shifting colour', () => {
    const dim = pixels(Array.from({ length: 1000 }, (_, i) => [10 + (i % 60), 8 + (i % 50), 5 + (i % 40)]))
    const before = new Uint8ClampedArray(dim)
    normaliseBrightness(dim)
    expect(meanLuma(dim)).toBeGreaterThan(meanLuma(before) * 2)
    for (let i = 0; i < dim.length; i++) expect(dim[i]).toBeGreaterThanOrEqual(before[i])
    for (let i = 0; i < dim.length; i += 4) {
      if (before[i] > before[i + 2] + 5) expect(dim[i]).toBeGreaterThanOrEqual(dim[i + 2])
    }
  })

  it('leaves a well-exposed photo close to how it was', () => {
    const good = pixels(Array.from({ length: 1000 }, (_, i) => [(i * 7) % 256, (i * 13) % 256, (i * 3) % 256]))
    const before = meanLuma(good)
    normaliseBrightness(good)
    expect(Math.abs(meanLuma(good) - before)).toBeLessThan(6)
  })

  it('copes with empty and black images', () => {
    expect(() => normaliseBrightness(new Uint8ClampedArray(0))).not.toThrow()
    expect(() => normaliseBrightness(pixels([[0, 0, 0]]))).not.toThrow()
  })
})
