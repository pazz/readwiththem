import assert from 'node:assert'
import { register } from 'node:module'

register('./ts-extension-hook.mjs', import.meta.url)

// Mock fetch before importing catalogue.ts, so searchOpenLibrary/searchGoogleBooks
// hit these fixtures instead of the network.
const openLibraryResponse = {
  numFound: 1,
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

global.fetch = async (url) => {
  const isGoogle = url.includes('googleapis.com')
  return {
    ok: true,
    json: async () => (isGoogle ? googleResponse : openLibraryResponse),
  }
}

const { searchCatalogue } = await import('../src/catalogue.ts')

const results = await searchCatalogue('gruffalo granny')

const granny = results.find((r) => r.title === 'Gruffalo Granny')
assert.ok(granny, 'Open Library result must still be present')
assert.strictEqual(
  granny.coverUrl,
  'https://books.google.com/gruffalo-granny.jpg',
  'coverless Open Library record must be backfilled from Google, not shadow it',
)

const googleOnly = results.find((r) => r.title === 'A Google-only Book')
assert.ok(googleOnly, 'a Google result with no Open Library match must still appear')

assert.strictEqual(results.length, 2, 'must not duplicate the merged record')

console.log('catalogue merge checks passed')
