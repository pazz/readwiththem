import type { BookSearchResult } from './openLibrary'
import { parseMarc } from './marc'
import { parseBnfDublinCore } from './bnf'
import { languageFromISBN } from './language'
import { fetchWithin } from './http'

// A barcode's ISBN prefix says which country's publishers issued it, so that
// country's own catalogue is the place to look first: it knows editions, and
// their titles in their own language, that Open Library and Google Books
// often miss. Every source here sends CORS headers, needs no key and answers
// in well under a second; each was measured against real children's books.

export type Library = 'dnb' | 'bnf' | 'bne' | 'openbd' | 'brasilapi'

const digits = (isbn: string) => isbn.replace(/[^0-9]/g, '')

export function libraryFor(isbn: string): Library | undefined {
  const d = digits(isbn)
  if (d.startsWith('9783')) return 'dnb' // German-speaking countries
  if (d.startsWith('9782') || d.startsWith('97910')) return 'bnf' // French-speaking countries
  if (d.startsWith('97884')) return 'bne' // Spain
  if (d.startsWith('9784')) return 'openbd' // Japan
  if (d.startsWith('97865') || d.startsWith('97885')) return 'brasilapi' // Brazil
  return undefined
}

const text = (url: string) =>
  fetchWithin(url, (res) => {
    if (!res.ok) throw new Error(`Library lookup failed: ${res.status}`)
    return res.text()
  })

const json = <T>(url: string) =>
  fetchWithin(url, (res): Promise<T> => {
    if (!res.ok) throw new Error(`Library lookup failed: ${res.status}`)
    return res.json()
  })

export const bnfCoverByISBN = (isbn: string) =>
  `https://openapi.bnf.fr/couverture/image/image/recupererImage?EAN=${digits(isbn)}&couverture=1`

interface FoundRecord {
  title: string
  author?: string
  language?: string
  coverUrl?: string
}

// openBD, the Japanese publishers' database: an array with one entry per
// ISBN asked for, null where it has none. Authors read "中川,李枝子 大村,百合子".
interface OpenBdEntry {
  summary?: { title?: string; author?: string; cover?: string }
}

export function readOpenBd(entries: Array<OpenBdEntry | null>): FoundRecord | undefined {
  const summary = entries[0]?.summary
  if (!summary?.title) return undefined
  const author = summary.author?.trim().split(/\s+/)[0]?.replace(',', '')
  return { title: summary.title, author: author || undefined, coverUrl: summary.cover || undefined }
}

// BrasilAPI's ISBN service, backed by the Brazilian ISBN agency (CBL): often
// a title and no author or cover.
interface BrasilApiBook {
  title?: string
  authors?: string[]
  cover_url?: string | null
}

export function readBrasilApi(book: BrasilApiBook): FoundRecord | undefined {
  if (!book.title) return undefined
  return { title: book.title, author: book.authors?.[0], coverUrl: book.cover_url ?? undefined }
}

async function find(library: Library, id: string): Promise<FoundRecord | undefined> {
  switch (library) {
    case 'dnb':
      return parseMarc(
        await text(
          `https://services.dnb.de/sru/dnb?version=1.1&operation=searchRetrieve&query=${encodeURIComponent(`num=${id}`)}&recordSchema=MARC21-xml&maximumRecords=1`,
        ),
      )[0]
    case 'bne':
      return parseMarc(
        await text(
          `https://catalogo.bne.es/view/sru/34BNE_INST?version=1.2&operation=searchRetrieve&query=${encodeURIComponent(`alma.isbn=${id}`)}&maximumRecords=1`,
        ),
      )[0]
    case 'bnf': {
      const record = parseBnfDublinCore(
        await text(
          `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${encodeURIComponent(`bib.isbn all "${id}"`)}&recordSchema=dublincore&maximumRecords=1`,
        ),
      )[0]
      // The only national library that offers covers. Not every book has one.
      return record && { ...record, coverUrl: bnfCoverByISBN(id) }
    }
    case 'openbd':
      return readOpenBd(await json<Array<OpenBdEntry | null>>(`https://api.openbd.jp/v1/get?isbn=${id}`))
    case 'brasilapi':
      return readBrasilApi(await json<BrasilApiBook>(`https://brasilapi.com.br/api/isbn/v1/${id}`))
  }
}

export async function lookupNationalLibrary(isbn: string): Promise<BookSearchResult | null> {
  const id = digits(isbn)
  const library = libraryFor(id)
  if (!library) return null
  const record = await find(library, id)
  if (!record) return null
  return {
    title: record.title,
    author: record.author ?? 'Unknown',
    isbn: id,
    language: record.language ?? languageFromISBN(id),
    coverUrl: record.coverUrl,
    source: 'library',
  }
}
