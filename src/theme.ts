// Each child can have a colour, which becomes the app's accent while they are
// the active child. Only the accent family changes (buttons, active tab, links,
// focus rings, favicon); backgrounds and text stay put.
//
// A picked colour is softened (see MAX_SATURATION) so a vivid pick from a raw
// colour wheel still lands as muted as the rest of this editorial palette, and
// then nudged just far enough for contrast: darkened in light mode until white
// text on it (and it as text on the app's backgrounds) reaches WCAG AA 4.5:1,
// lightened in dark mode until dark text on it does.

export const DEFAULT_COLOUR = '#2c5f4f'

// A handful of already-soft, already-readable options, alongside the free
// picker — chosen to sit with the app's own warm, muted palette rather than
// reading as a bright picker-app rainbow. "Forest" is the untouched default.
export const PRESET_COLOURS: Array<{ name: string; hex: string }> = [
  { name: 'Forest', hex: DEFAULT_COLOUR },
  { name: 'Terracotta', hex: '#a8422c' },
  { name: 'Dusty blue', hex: '#3d6b85' },
  { name: 'Plum', hex: '#6b4c6e' },
  { name: 'Mustard', hex: '#a67c2e' },
  { name: 'Teal', hex: '#3f7d72' },
  { name: 'Dusty rose', hex: '#a05a6b' },
]

// A custom pick rarely needs taming this hard, but a colour wheel's most
// likely picks — the fully saturated rim — otherwise come out far louder
// than anything else in the app.
const MAX_SATURATION = 0.6

type RGB = [number, number, number]
type HSL = [number, number, number]

function hexToRgb(hex: string): RGB {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB
}

function rgbToHex(rgb: RGB): string {
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round(Math.min(255, Math.max(0, v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}

function toHsl(hex: string): HSL {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    if (h < 0) h += 6
  }
  return [h, s, l]
}

function fromHsl([h, s, l]: HSL): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h % 2) - 1))
  const [r1, g1, b1] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x]
  const m = l - c / 2
  return rgbToHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255])
}

// t = 0 gives a, t = 1 gives b.
function mix(a: string, b: string, t: number): string {
  const [ra, ga, ba] = hexToRgb(a)
  const [rb, gb, bb] = hexToRgb(b)
  return rgbToHex([ra + (rb - ra) * t, ga + (gb - ga) * t, ba + (bb - ba) * t])
}

// Ceiling, not a blanket reduction: an already-muted colour (every preset
// above) passes through untouched, only a louder pick gets pulled down.
function soften(hex: string): string {
  const [h, s, l] = toHsl(hex)
  return s <= MAX_SATURATION ? hex : fromHsl([h, MAX_SATURATION, l])
}

// Moves lightness towards 0 (t = 1 is black) or 1 (t = 1 is white), keeping
// the hue, so a red lightened for dark mode stays a red rather than fading to
// the salmon that mixing with white gives.
function shiftLightness(hex: string, towardsWhite: boolean, t: number): string {
  const [h, s, l] = toHsl(hex)
  const l2 = l + ((towardsWhite ? 1 : 0) - l) * t
  // Lightening washes colours out, so saturation rises with it (in proportion,
  // so a grey stays grey and a muted colour stays relatively muted).
  const s2 = towardsWhite ? Math.min(1, s * (1 + t)) : s
  return fromHsl([h, s2, l2])
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export interface Accent {
  primary: string
  hover: string
  soft: string
  contrast: string
}

// The mode-specific values the accent has to be readable against. The "ref"
// is the least favourable background the accent appears on as text (the
// alternate surface), the soft tint is the active tab behind accent text.
const MODES = {
  light: { towards: '#000000', ref: '#f0ece2', tintBase: '#ffffff', tint: 0.12, text: '#ffffff' },
  dark: { towards: '#ffffff', ref: '#262a2f', tintBase: '#1f2226', tint: 0.22, text: '#0c130f' },
} as const

function accentFor(rawHex: string, mode: keyof typeof MODES): Accent {
  const hex = soften(rawHex)
  const m = MODES[mode]
  for (let t = 0; ; t += 0.05) {
    const primary = shiftLightness(hex, mode === 'dark', Math.min(t, 1))
    const soft = mix(m.tintBase, primary, m.tint)
    const readable = contrast(primary, m.ref) >= 4.5 && contrast(primary, soft) >= 4.5
    // At t = 1 the primary is pure black or white, which always passes.
    if (readable || t >= 1) return { primary, soft, hover: mix(primary, m.towards, 0.15), contrast: m.text }
  }
}

export function childTheme(hex: string): { light: Accent; dark: Accent } {
  return { light: accentFor(hex, 'light'), dark: accentFor(hex, 'dark') }
}

function faviconFor(hex: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${hex}"/><g fill="#fdfaf5"><path d="M256 140c-30-24-76-36-120-36v268c44 0 90 12 120 36 30-24 76-36 120-36V104c-44 0-90 12-120 36z"/><path d="M256 176v220" stroke="${hex}" stroke-width="10"/></g></svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}

// Sets (or clears) the --child-* variables that index.css falls back from, plus
// the browser's theme colour and the tab icon. The installed app's home-screen
// icon is fixed at install time and cannot follow.
export function applyTheme(hex: string | undefined): void {
  const root = document.documentElement.style
  const names = ['primary', 'hover', 'soft', 'contrast'] as const
  const custom = hex && hex.toLowerCase() !== DEFAULT_COLOUR ? childTheme(hex) : undefined
  for (const name of names) {
    const prop = name === 'primary' ? '--child-primary' : `--child-primary-${name}`
    if (custom) {
      root.setProperty(prop, custom.light[name])
      root.setProperty(`${prop}-dark`, custom.dark[name])
    } else {
      root.removeProperty(prop)
      root.removeProperty(`${prop}-dark`)
    }
  }
  const primary = custom?.light.primary ?? DEFAULT_COLOUR
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', primary)
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (icon) icon.href = custom ? faviconFor(primary) : `${import.meta.env.BASE_URL}icons/icon-192.png`
}

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)')

// Applies the light or dark theme ("system" follows the device, live). Returns
// a cleanup that stops following it.
export function applyColourScheme(pref: 'system' | 'light' | 'dark'): () => void {
  const set = () => {
    const dark = pref === 'dark' || (pref === 'system' && systemDark().matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }
  set()
  if (pref !== 'system') return () => {}
  const query = systemDark()
  query.addEventListener('change', set)
  return () => query.removeEventListener('change', set)
}
