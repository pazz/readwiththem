// Open Library is the primary catalogue; Google Books only fills gaps (a
// missing result, or a missing cover) and never replaces it. No retailer or
// affiliate catalogue, by design.
import { searchBooks as searchOpenLibrary, lookupByISBN as lookupOpenLibraryISBN, type BookSearchResult } from './openLibrary'
import { searchGoogleBooks, lookupByISBNGoogleBooks } from './googleBooks'

export type { BookSearchResult }

function dedupeKey(r: BookSearchResult): string {
  return r.isbn ?? `${r.title}|${r.author}`.toLowerCase()
}

export async function searchCatalogue(query: string): Promise<BookSearchResult[]> {
  const [primaryResult, gapFillerResult] = await Promise.allSettled([searchOpenLibrary(query), searchGoogleBooks(query)])
  const primary = primaryResult.status === 'fulfilled' ? primaryResult.value : []
  const gapFiller = gapFillerResult.status === 'fulfilled' ? gapFillerResult.value : []

  // A coverless Open Library record must not shadow a Google record that has
  // one — fill in the missing field rather than just deciding the whole result
  // is a duplicate and discarding it.
  const gapFillerByKey = new Map(gapFiller.map((r) => [dedupeKey(r), r]))
  const merged = primary.map((r) => (r.coverUrl ? r : { ...r, coverUrl: gapFillerByKey.get(dedupeKey(r))?.coverUrl }))

  const seen = new Set(primary.map(dedupeKey))
  const extra = gapFiller.filter((r) => !seen.has(dedupeKey(r)))
  return [...merged, ...extra]
}

export async function lookupISBN(isbn: string): Promise<BookSearchResult | null> {
  const primary = await lookupOpenLibraryISBN(isbn).catch(() => null)
  if (primary?.coverUrl) return primary

  const gapFiller = await lookupByISBNGoogleBooks(isbn).catch(() => null)
  if (primary) return { ...primary, coverUrl: gapFiller?.coverUrl ?? primary.coverUrl }
  return gapFiller
}
