import type { BookSearchResult } from './openLibrary'
import { parseMarc } from './marc'
import { parseBnfDublinCore } from './bnf'
import { languageFromISBN } from './language'

// A barcode's ISBN prefix says which country's publishers issued it, so the
// national library of that country is the place to look first: it knows
// German, French and Spanish editions that Open Library and Google Books
// often miss. All three send CORS headers and need no key.

export type Library = 'dnb' | 'bnf' | 'bne'

const digits = (isbn: string) => isbn.replace(/[^0-9]/g, '')

export function libraryFor(isbn: string): Library | undefined {
  const d = digits(isbn)
  if (d.startsWith('9783')) return 'dnb' // German-speaking countries
  if (d.startsWith('9782') || d.startsWith('97910')) return 'bnf' // French-speaking countries
  if (d.startsWith('97884')) return 'bne' // Spain
  return undefined
}

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Library lookup failed: ${res.status}`)
  return res.text()
}

export const bnfCoverByISBN = (isbn: string) =>
  `https://openapi.bnf.fr/couverture/image/image/recupererImage?EAN=${digits(isbn)}&couverture=1`

export async function lookupNationalLibrary(isbn: string): Promise<BookSearchResult | null> {
  const id = digits(isbn)
  const library = libraryFor(id)
  if (!library) return null
  let record: { title: string; author?: string; language?: string } | undefined
  if (library === 'dnb') {
    const url = `https://services.dnb.de/sru/dnb?version=1.1&operation=searchRetrieve&query=${encodeURIComponent(`num=${id}`)}&recordSchema=MARC21-xml&maximumRecords=1`
    record = parseMarc(await fetchXml(url))[0]
  } else if (library === 'bne') {
    const url = `https://catalogo.bne.es/view/sru/34BNE_INST?version=1.2&operation=searchRetrieve&query=${encodeURIComponent(`alma.isbn=${id}`)}&maximumRecords=1`
    record = parseMarc(await fetchXml(url))[0]
  } else {
    const url = `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${encodeURIComponent(`bib.isbn all "${id}"`)}&recordSchema=dublincore&maximumRecords=1`
    record = parseBnfDublinCore(await fetchXml(url))[0]
  }
  if (!record) return null
  return {
    title: record.title,
    author: record.author ?? 'Unknown',
    isbn: id,
    language: record.language ?? languageFromISBN(id),
    // The BnF's covers are the only ones a national library offers.
    coverUrl: library === 'bnf' ? bnfCoverByISBN(id) : undefined,
    source: 'library',
  }
}
