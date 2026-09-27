import { describe, expect, it } from 'vitest'
import { childTheme, contrast, DEFAULT_COLOUR, PRESET_COLOURS } from './theme'

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const saturationOf = (hex: string) => {
  const [r, g, b] = channels(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  return d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
}

describe('childTheme', () => {
  it.each(['#2c5f4f', '#c0392b', '#ffff00', '#ffffff', '#000000', '#87ceeb', '#ff69b4', '#1a237e', '#f5deb3', '#808080'])(
    'makes %s readable in both modes (WCAG AA)',
    (hex) => {
      const { light, dark } = childTheme(hex)
      expect(contrast(light.primary, light.contrast)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(light.primary, '#f0ece2')).toBeGreaterThanOrEqual(4.5)
      expect(contrast(light.primary, light.soft)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(dark.primary, dark.contrast)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(dark.primary, '#262a2f')).toBeGreaterThanOrEqual(4.5)
      expect(contrast(dark.primary, dark.soft)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('leaves the default untouched and adjusts unreadable or loud picks', () => {
    expect(childTheme(DEFAULT_COLOUR).light.primary).toBe(DEFAULT_COLOUR)
    expect(childTheme('#ffff00').light.primary).not.toBe('#ffff00')
    expect(childTheme('#ff0000').light.primary).not.toBe('#ff0000')
  })

  it('offers only presets that need no softening', () => {
    for (const { hex } of PRESET_COLOURS) expect(saturationOf(hex)).toBeLessThanOrEqual(0.6)
  })

  it('keeps the hue when adjusting lightness', () => {
    for (const mode of ['light', 'dark'] as const) {
      const [r, g, b] = channels(childTheme('#ff69b4')[mode].primary)
      expect(r).toBeGreaterThanOrEqual(b)
      expect(b).toBeGreaterThan(g)
    }
  })
})
