// Open Library is the main English-language catalogue, and Google Books fills
// its gaps (a missing result, or a missing cover). Inventaire finds books by
// their German, French or Spanish titles, and a barcode's ISBN prefix sends
// the lookup to that country's national library. No retailer or affiliate
// catalogue, by design.
import { searchBooks as searchOpenLibrary, lookupByISBN as lookupOpenLibraryISBN, type BookSearchResult } from './openLibrary'
import { searchGoogleBooks, lookupByISBNGoogleBooks } from './googleBooks'
import { languageFromISBN, SOURCE_DEFAULT_LANGUAGE } from './language'
import { searchInventaire } from './inventaire'
import { lookupNationalLibrary } from './nationalLibraries'
export type { BookSearchResult }

function dedupeKey(r: BookSearchResult): string {
  return r.isbn ?? `${r.title}|${r.author}`.toLowerCase()
}

const sameTitle = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export async function searchCatalogue(query: string): Promise<BookSearchResult[]> {
  const [primaryResult, gapFillerResult, inventaireResult] = await Promise.allSettled([
    searchOpenLibrary(query),
    searchGoogleBooks(query),
    searchInventaire(query),
  ])
  const primary = primaryResult.status === 'fulfilled' ? primaryResult.value : []
  const gapFiller = gapFillerResult.status === 'fulfilled' ? gapFillerResult.value : []
  const inventaire = inventaireResult.status === 'fulfilled' ? inventaireResult.value : []

  // A coverless Open Library record must not shadow a Google record that has
  // one — fill in the missing field rather than just deciding the whole result
  // is a duplicate and discarding it.
  const gapFillerByKey = new Map(gapFiller.map((r) => [dedupeKey(r), r]))
  const merged = primary.map((r) => (r.coverUrl ? r : { ...r, coverUrl: gapFillerByKey.get(dedupeKey(r))?.coverUrl }))
  const seen = new Set(primary.map(dedupeKey))
  const extra = gapFiller.filter((r) => !seen.has(dedupeKey(r)))
  const english = [...merged, ...extra]

  // Inventaire goes first: it names a translated book as typed, where Open
  // Library gives the English original. A book both know keeps Open Library's
  // ISBN and author, and the first cover found.
  const englishByTitle = new Map(english.map((r) => [sameTitle(r.title), r]))
  const known = new Set<BookSearchResult>()
  const fromInventaire = inventaire.map((r) => {
    const match = englishByTitle.get(sameTitle(r.title))
    if (!match) return r
    known.add(match)
    return {
      ...r,
      author: match.author !== 'Unknown' ? match.author : r.author,
      isbn: match.isbn,
      language: r.language ?? match.language,
      coverUrl: match.coverUrl ?? r.coverUrl,
      source: match.source,
    }
  })
  // Only a result nothing else has vouched for gets the guess from its source.
  const alone = english.filter((r) => !known.has(r)).map((r) => ({ ...r, language: r.language ?? SOURCE_DEFAULT_LANGUAGE[r.source] }))
  return [...fromInventaire, ...alone]
}

export async function lookupISBN(isbn: string): Promise<BookSearchResult | null> {
  // All at once, each capped by fetchWithin's timeout: a scan waits for the
  // slowest source, never for one after another.
  const [national, openLibrary, googleBooks] = await Promise.all([
    lookupNationalLibrary(isbn).catch(() => null),
    lookupOpenLibraryISBN(isbn).catch(() => null),
    lookupByISBNGoogleBooks(isbn).catch(() => null),
  ])
  // The national catalogue names the edition in its own language.
  const found = national ?? openLibrary ?? googleBooks
  if (!found) return null
  // Covers known to exist come first; then ones that may (a wrong guess falls
  // back to the placeholder when the image fails to load).
  const coverUrl =
    openLibrary?.coverUrl ??
    googleBooks?.coverUrl ??
    national?.coverUrl ??
    `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`
  // Failing a record that says so, the ISBN's prefix is a good guess at the language.
  return { ...found, coverUrl, language: found.language ?? languageFromISBN(isbn) }
}
