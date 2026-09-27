import { describe, expect, it } from 'vitest'
import { guideRectInDisplay, displayRectToVideoRect, GUIDE_ASPECT } from './cropGuide'

describe('guideRectInDisplay', () => {
  it.each([
    [400, 800],
    [800, 400],
    [390, 600],
  ])('is centred, cover-shaped and inside a %ix%i box', (dw, dh) => {
    const g = guideRectInDisplay(dw, dh)
    expect(g.width / g.height).toBeCloseTo(GUIDE_ASPECT)
    expect(g.x).toBeCloseTo((dw - g.width) / 2)
    expect(g.y).toBeCloseTo((dh - g.height) / 2)
    expect(g.width).toBeLessThanOrEqual(dw)
    expect(g.height).toBeLessThanOrEqual(dh)
  })
})

describe('displayRectToVideoRect', () => {
  it('maps a rectangle to itself when display and video match', () => {
    const g = guideRectInDisplay(400, 600)
    const v = displayRectToVideoRect(g, 400, 600, 400, 600)
    expect(v.x).toBeCloseTo(g.x)
    expect(v.y).toBeCloseTo(g.y)
    expect(v.width).toBeCloseTo(g.width)
    expect(v.height).toBeCloseTo(g.height)
  })

  it('accounts for the strip object-fit: cover crops off a wider video', () => {
    const guide = { x: 100, y: 50, width: 200, height: 300 }
    // 800x400 video in a 400x400 box: scale 1, 200px cropped off each side.
    const v = displayRectToVideoRect(guide, 800, 400, 400, 400)
    expect(v.x).toBeCloseTo(300)
    expect(v.y).toBeCloseTo(50)
    expect(v.width).toBeCloseTo(200)
    expect(v.x + v.width).toBeLessThanOrEqual(800)
    expect(v.y + v.height).toBeLessThanOrEqual(400)
  })
})
