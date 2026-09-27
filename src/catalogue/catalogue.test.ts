import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchCatalogue } from './catalogue'

const openLibraryResponse = {
  docs: [{ title: 'Gruffalo Granny', author_name: ['Julia Donaldson'], isbn: ['9781407190438'] }], // no cover_i
}
const googleResponse = {
  items: [
    {
      volumeInfo: {
        title: 'Gruffalo Granny',
        authors: ['Julia Donaldson'],
        imageLinks: { thumbnail: 'http://books.google.com/gruffalo-granny.jpg' },
        industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781407190438' }],
      },
    },
    {
      volumeInfo: {
        title: 'A Google-only Book',
        authors: ['Someone Else'],
        imageLinks: { thumbnail: 'http://books.google.com/google-only.jpg' },
      },
    },
  ],
}

afterEach(() => vi.unstubAllGlobals())

describe('searchCatalogue', () => {
  it('fills a missing Open Library cover from Google and keeps Google-only results', async () => {
    vi.stubGlobal('fetch', async (url: string) => ({
      ok: true,
      json: async () => (url.includes('googleapis.com') ? googleResponse : openLibraryResponse),
    }))
    const results = await searchCatalogue('gruffalo granny')
    expect(results).toHaveLength(2)
    expect(results.find((r) => r.title === 'Gruffalo Granny')?.coverUrl).toBe('https://books.google.com/gruffalo-granny.jpg')
    expect(results.find((r) => r.title === 'A Google-only Book')).toBeDefined()
  })
})
