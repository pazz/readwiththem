import type { BookSearchResult } from './openLibrary'

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

const words = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)

// "Buch von Eric Carle", "Roman de Julia Donaldson (1999)": the author is all
// Inventaire's search gives us, and only as a description.
export function authorFromDescription(description: string | undefined): string {
  const match = description && /\b(?:von|de|par|by|di)\s+(.+?)(?:\s*\(\d{4}\))?$/i.exec(description)
  return match ? match[1] : 'Unknown'
}

async function searchIn(query: string, lang: string): Promise<InventaireWork[]> {
  const url = `${BASE}/api/search?types=works&search=${encodeURIComponent(query)}&lang=${lang}&limit=5`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Inventaire search failed: ${res.status}`)
  const data: { results?: InventaireWork[] } = await res.json()
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
  const uiLanguage = (typeof navigator === 'undefined' ? 'en' : navigator.language).slice(0, 2).toLowerCase()
  const languages = [...new Set([uiLanguage, ...LANGUAGES])]
  const perLanguage = await Promise.allSettled(languages.map((l) => searchIn(query, l)))
  const typed = new Set(words(query))
  const overlap = (label: string) => words(label).filter((w) => typed.has(w)).length
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
      coverUrl: w.image ? `${BASE}${w.image}` : undefined,
      // The label's language is the book's, unless every language gave the
      // same label (no translation), which says nothing.
      language: labels.get(w.id)!.size > 1 ? w.lang : undefined,
      source: 'inventaire' as const,
    }))
}
