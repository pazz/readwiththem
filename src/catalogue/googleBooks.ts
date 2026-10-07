import type { BookSearchResult } from './openLibrary'
import { languageFromCode } from './language'
import { fetchWithin } from './http'

// Public Google Books volumes API, without a key. Its shared keyless quota is
// often used up (429), so it only ever fills gaps.
export async function searchGoogleBooks(query: string): Promise<BookSearchResult[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10`
  const data: { items?: GoogleVolume[] } = await fetchWithin(url, (res) => {
    if (!res.ok) throw new Error(`Google Books search failed: ${res.status}`)
    return res.json()
  })
  return (data.items ?? []).map(toBookSearchResult)
}

export async function lookupByISBNGoogleBooks(isbn: string): Promise<BookSearchResult | null> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
  const data: { items?: GoogleVolume[] } = await fetchWithin(url, (res) => {
    if (!res.ok) throw new Error(`Google Books lookup failed: ${res.status}`)
    return res.json()
  })
  const item = data.items?.[0]
  return item ? { ...toBookSearchResult(item), isbn } : null
}

interface GoogleVolume {
  volumeInfo: {
    title: string
    authors?: string[]
    imageLinks?: { thumbnail?: string }
    industryIdentifiers?: Array<{ type: string; identifier: string }>
    language?: string
  }
}

function toBookSearchResult(item: GoogleVolume): BookSearchResult {
  const isbn13 = item.volumeInfo.industryIdentifiers?.find((id) => id.type === 'ISBN_13')?.identifier
  return {
    title: item.volumeInfo.title,
    author: item.volumeInfo.authors?.[0] ?? 'Unknown',
    isbn: isbn13,
    language: languageFromCode(item.volumeInfo.language),
    // Google serves cover thumbnails over http:// by default; force https to avoid mixed-content blocks.
    coverUrl: item.volumeInfo.imageLinks?.thumbnail?.replace(/^http:/, 'https:'),
    source: 'googlebooks',
  }
}
