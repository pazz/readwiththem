import type { BookSearchResult } from './openLibrary'
import { fetchWithin } from './http'

// Inventaire is an open, Wikidata-based catalogue of books, and labels each
// work in the language asked for, so a German child's "Die kleine Raupe
// Nimmersatt" is found and shown by that name, not as its English original.

const BASE = 'https://inventaire.io'
const LANGUAGES = ['en', 'de', 'fr', 'es']

interface InventaireWork {
  id: string
  label: string
  description?: string
  image?: string
  _score: number
}

// Words in any script, lower-cased and without accents. Chinese and Japanese
// don't separate words with spaces, so a run of their characters counts as
// one word, and a word matches when either contains the other.
const words = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 || /[^a-z0-9]/.test(w))

// A title in a script of its own says which language to ask for, in one
// request; Latin script could be almost anything, so then several are asked
// (see searchInventaire), plus a language its letters give away.
export function languageOfScript(query: string): string | undefined {
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(query)) return 'ja'
  if (/\p{Script=Hangul}/u.test(query)) return 'ko'
  if (/\p{Script=Han}/u.test(query)) return 'zh'
  if (/\p{Script=Cyrillic}/u.test(query)) return 'ru'
  if (/\p{Script=Greek}/u.test(query)) return 'el'
  return undefined
}

export function languageOfLetters(query: string): string | undefined {
  if (/[ąęłńśźż]/i.test(query)) return 'pl'
  if (/[ěřůťď]/i.test(query)) return 'cs'
  if (/[ãõ]/i.test(query)) return 'pt'
  return undefined
}

// "Buch von Eric Carle", "Roman de Julia Donaldson (1999)": the author is all
// Inventaire's search gives us, and only as a description.
export function authorFromDescription(description: string | undefined): string {
  const match = description && /\b(?:von|de|par|by|di)\s+(.+?)(?:\s*\(\d{4}\))?$/i.exec(description)
  return match ? match[1] : 'Unknown'
}

// Inventaire turns away a burst of requests (429) for as long as its
// Retry-After says, up to half an hour; until then, don't ask.
let pausedUntil = 0
export const resumeInventaire = () => (pausedUntil = 0)

async function searchIn(query: string, lang: string): Promise<InventaireWork[]> {
  const url = `${BASE}/api/search?types=works&search=${encodeURIComponent(query)}&lang=${lang}&limit=5`
  const data: { results?: InventaireWork[] } = await fetchWithin(url, (res) => {
    if (res.status === 429) {
      const seconds = Number(res.headers.get('retry-after')) || 60
      pausedUntil = Date.now() + Math.min(seconds, 1800) * 1000
    }
    if (!res.ok) throw new Error(`Inventaire search failed: ${res.status}`)
    return res.json()
  })
  const results = data.results ?? []
  // Beyond the first few, scores fall off a cliff into unrelated books.
  const top = results[0]?._score ?? 0
  return results.filter((r) => r._score >= top / 100)
}

/**
 * The same work comes back once per language, labelled in that language; keep
 * it once, under the label that best matches what was typed.
 */
export async function searchInventaire(query: string): Promise<BookSearchResult[]> {
  if (Date.now() < pausedUntil) throw new Error('Inventaire asked us to wait')
  const uiLanguage = (typeof navigator === 'undefined' ? 'en' : navigator.language).slice(0, 2).toLowerCase()
  const script = languageOfScript(query)
  const languages = script ? [script] : [...new Set([uiLanguage, ...LANGUAGES, languageOfLetters(query)].filter((l) => l !== undefined))]
  const perLanguage = await Promise.allSettled(languages.map((l) => searchIn(query, l)))
  const typed = words(query)
  const overlap = (label: string) => {
    const said = words(label)
    return typed.filter((t) => said.some((w) => w === t || (/[^a-z0-9]/.test(t) && (w.includes(t) || t.includes(w))))).length
  }
  const best = new Map<string, InventaireWork & { lang: string }>()
  const labels = new Map<string, Set<string>>()
  perLanguage.forEach((outcome, i) => {
    if (outcome.status !== 'fulfilled') return
    for (const work of outcome.value) {
      labels.set(work.id, (labels.get(work.id) ?? new Set()).add(work.label))
      const current = best.get(work.id)
      if (!current || overlap(work.label) > overlap(current.label)) best.set(work.id, { ...work, lang: languages[i] })
    }
  })
  if (perLanguage.every((o) => o.status === 'rejected')) throw new Error('Inventaire search failed')
  return [...best.values()]
    .filter((w) => overlap(w.label) > 0)
    .map((w) => ({
      title: w.label,
      author: authorFromDescription(w.description),
      // Some images are Wikimedia Commons file names, not paths: no cover then.
      coverUrl: w.image?.startsWith('/') ? `${BASE}${w.image}` : undefined,
      // A title in its own script is in that language. Otherwise the label's
      // language is the book's, unless every language gave the same label
      // (no translation), which says nothing.
      language: script ?? (labels.get(w.id)!.size > 1 ? w.lang : undefined),
      source: 'inventaire' as const,
    }))
}
