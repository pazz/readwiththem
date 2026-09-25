import assert from 'node:assert'
import { childTheme, contrast, DEFAULT_COLOUR, PRESET_COLOURS } from '../src/theme.ts'

const picks = ['#2c5f4f', '#c0392b', '#ffff00', '#ffffff', '#000000', '#87ceeb', '#ff69b4', '#1a237e', '#f5deb3', '#808080']
for (const hex of picks) {
  const { light, dark } = childTheme(hex)
  assert.ok(contrast(light.primary, light.contrast) >= 4.5, `${hex}: white text on the light-mode accent is readable`)
  assert.ok(contrast(light.primary, '#f0ece2') >= 4.5, `${hex}: light-mode accent is readable as text on the page`)
  assert.ok(contrast(light.primary, light.soft) >= 4.5, `${hex}: light-mode accent is readable on its own soft tint (active tab)`)
  assert.ok(contrast(dark.primary, dark.contrast) >= 4.5, `${hex}: dark text on the dark-mode accent is readable`)
  assert.ok(contrast(dark.primary, '#262a2f') >= 4.5, `${hex}: dark-mode accent is readable as text on the page`)
  assert.ok(contrast(dark.primary, dark.soft) >= 4.5, `${hex}: dark-mode accent is readable on its own soft tint`)
}

assert.strictEqual(childTheme(DEFAULT_COLOUR).light.primary, DEFAULT_COLOUR, 'the default green is already readable, so it is used untouched')
assert.notStrictEqual(childTheme('#ffff00').light.primary, '#ffff00', 'an unreadable pick (yellow) is adjusted in light mode')
assert.notStrictEqual(childTheme('#ff0000').light.primary, '#ff0000', 'a fully saturated pick is softened, even one already readable')

// Every preset is already muted, so it must pass through the softening step
// untouched (only the WCAG lightness shift, if any, may move it) — that's the
// whole point of hand-picking them.
const saturationOf = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  return d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
}
for (const { name, hex } of PRESET_COLOURS) {
  assert.ok(saturationOf(hex) <= 0.6, `preset "${name}" (${hex}) is already soft enough not to need capping`)
}

// Adjusting lightness must keep the hue: a pink stays pink (red highest, blue
// above green), never drifting to orange.
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
for (const mode of ['light', 'dark']) {
  const [r, g, b] = channels(childTheme('#ff69b4')[mode].primary)
  assert.ok(r >= b && b > g, `pink keeps its hue in ${mode} mode (got ${childTheme('#ff69b4')[mode].primary})`)
}

console.log('theme checks passed')
