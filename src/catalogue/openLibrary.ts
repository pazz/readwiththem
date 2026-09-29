// Open Library's public search API, called directly from the browser. The
// primary catalogue; catalogue.ts fills its gaps from Google Books.
import type { Edition } from '../types'

export interface BookSearchResult {
  title: string
  author: string
  isbn?: string
  coverUrl?: string
  language?: string
  // Where the record came from; household matches carry their own.
  source: Edition['source']
}

export async function searchBooks(query: string): Promise<BookSearchResult[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=title,author_name,cover_i,isbn&limit=10`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open Library search failed: ${res.status}`)
  const data: { docs: Array<{ title: string; author_name?: string[]; cover_i?: number; isbn?: string[] }> } = await res.json()
  return data.docs.map((d) => ({
    title: d.title,
    author: d.author_name?.[0] ?? 'Unknown',
    isbn: d.isbn?.[0],
    coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
    source: 'openlibrary',
  }))
}

export async function lookupByISBN(isbn: string): Promise<BookSearchResult | null> {
  const url = `https://openlibrary.org/search.json?q=isbn:${isbn}&fields=title,author_name,cover_i,isbn&limit=1`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open Library lookup failed: ${res.status}`)
  const data: { docs: Array<{ title: string; author_name?: string[]; cover_i?: number }> } = await res.json()
  const doc = data.docs[0]
  if (!doc) return null
  return {
    title: doc.title,
    author: doc.author_name?.[0] ?? 'Unknown',
    isbn,
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
    source: 'openlibrary',
  }
}
