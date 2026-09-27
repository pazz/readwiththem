import type { BookSearchResult } from './openLibrary'

// Public Google Books volumes API — no key needed at this request volume.
export async function searchGoogleBooks(query: string): Promise<BookSearchResult[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Google Books search failed: ${res.status}`)
  const data: { items?: GoogleVolume[] } = await res.json()
  return (data.items ?? []).map(toBookSearchResult)
}

export async function lookupByISBNGoogleBooks(isbn: string): Promise<BookSearchResult | null> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Google Books lookup failed: ${res.status}`)
  const data: { items?: GoogleVolume[] } = await res.json()
  const item = data.items?.[0]
  return item ? { ...toBookSearchResult(item), isbn } : null
}

interface GoogleVolume {
  volumeInfo: {
    title: string
    authors?: string[]
    imageLinks?: { thumbnail?: string }
    industryIdentifiers?: Array<{ type: string; identifier: string }>
  }
}

function toBookSearchResult(item: GoogleVolume): BookSearchResult {
  const isbn13 = item.volumeInfo.industryIdentifiers?.find((id) => id.type === 'ISBN_13')?.identifier
  return {
    title: item.volumeInfo.title,
    author: item.volumeInfo.authors?.[0] ?? 'Unknown',
    isbn: isbn13,
    // Google serves cover thumbnails over http:// by default; force https to avoid mixed-content blocks.
    coverUrl: item.volumeInfo.imageLinks?.thumbnail?.replace(/^http:/, 'https:'),
  }
}
