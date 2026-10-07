import { afterEach, describe, expect, it, vi } from 'vitest'
import { libraryFor, readBrasilApi, readOpenBd } from './nationalLibraries'
import { languageFromISBN } from './language'
import { languageOfLetters, languageOfScript, resumeInventaire, searchInventaire } from './inventaire'
import { lookupISBN } from './catalogue'
import { CATALOGUE_TIMEOUT_MS } from './http'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  resumeInventaire()
})

// Trimmed from real responses.
const openBd = [
  {
    summary: {
      isbn: '9784834000825',
      title: 'ぐりとぐら',
      volume: '',
      series: '',
      publisher: '福音館書店',
      pubdate: '196701',
      cover: '',
      author: '中川,李枝子 大村,百合子',
    },
  },
]
const brasilApi = {
  isbn: '8574120286',
  title: 'O grufalo',
  subtitle: null,
  authors: [],
  publisher: 'Brinque-Book',
  cover_url: null,
  provider: 'cbl',
}

describe('more national catalogues', () => {
  it.each([
    ['9784834000825', 'openbd'],
    ['9788574120287', 'brasilapi'],
    ['9786500000000', 'brasilapi'],
    ['9789722328296', undefined], // Portugal: BrasilAPI refuses its ISBNs
  ])('%s goes to %s', (isbn, library) => expect(libraryFor(isbn)).toBe(library))

  it('reads openBD, taking the first author and joining their name', () => {
    expect(readOpenBd(openBd)).toEqual({ title: 'ぐりとぐら', author: '中川李枝子', coverUrl: undefined })
    expect(readOpenBd([null])).toBeUndefined()
  })

  it('reads BrasilAPI, which often has no author or cover', () => {
    expect(readBrasilApi(brasilApi)).toEqual({ title: 'O grufalo', author: undefined, coverUrl: undefined })
  })

  it('names a Japanese book in Japanese, with the cover Open Library has', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('openbd.jp')) return { ok: true, json: async () => openBd }
      if (url.includes('openlibrary.org')) return { ok: true, json: async () => ({ docs: [{ title: 'Guri and Gura', cover_i: 8433761 }] }) }
      return { ok: false, status: 429 }
    })
    expect(await lookupISBN('9784834000825')).toEqual({
      title: 'ぐりとぐら',
      author: '中川李枝子',
      isbn: '9784834000825',
      language: 'ja',
      coverUrl: 'https://covers.openlibrary.org/b/id/8433761-M.jpg',
      source: 'library',
    })
  })

  it('does not wait for a source that hangs', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', (url: string, init: { signal: AbortSignal }) => {
      if (url.includes('openlibrary.org'))
        return Promise.resolve({ ok: true, json: async () => ({ docs: [{ title: 'O Grúfalo', author_name: ['Julia Donaldson'] }] }) })
      // Never answers, until the request is abandoned.
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
    })
    const lookup = lookupISBN('9788574120287')
    await vi.advanceTimersByTimeAsync(CATALOGUE_TIMEOUT_MS)
    expect(await lookup).toMatchObject({ title: 'O Grúfalo', language: 'pt' })
  })
})

describe('languages from ISBN prefixes checked against real books', () => {
  it.each([
    ['9788900000000', 'ko'],
    ['9789600000000', 'el'],
    ['9786180000000', 'el'],
    ['9789570000000', 'zh'],
    ['9786260000000', 'zh'],
    ['9786500000000', 'pt'],
  ])('%s is %s', (isbn, language) => expect(languageFromISBN(isbn)).toBe(language))

  it('still cannot tell Czech from Slovak', () => expect(languageFromISBN('9788000066042')).toBeUndefined())
})

describe('Inventaire in other scripts', () => {
  it('knows a language from its script, or from letters only it uses', () => {
    expect(languageOfScript('はらぺこあおむし')).toBe('ja')
    expect(languageOfScript('구름빵')).toBe('ko')
    expect(languageOfScript('小王子')).toBe('zh')
    expect(languageOfScript('Мойдодыр')).toBe('ru')
    expect(languageOfScript('Ο μικρός πρίγκιπας')).toBe('el')
    expect(languageOfScript('Il Gruffalò')).toBeUndefined()
    expect(languageOfLetters('Bardzo głodna gąsienica')).toBe('pl')
    expect(languageOfLetters('Tuze hladová housenka')).toBeUndefined()
  })

  it("asks once, in the script's language, and keeps a match it used to throw away", async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(new URL(url).searchParams.get('lang')!)
      return {
        ok: true,
        json: async () => ({
          results: [
            { id: 'Q491657', label: 'Очень голодная гусеница', description: 'книга Эрика Карла (1969)', _score: 519742 },
            { id: 'Q5943502', label: 'Голодная гора', description: 'novel by Daphne du Maurier', _score: 209 },
          ],
        }),
      }
    })
    const results = await searchInventaire('Очень голодная гусеница')
    expect(asked).toEqual(['ru'])
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ title: 'Очень голодная гусеница', language: 'ru' })
  })

  it('ignores an image that is not a path on Inventaire', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({ results: [{ id: 'Q1', label: 'Мойдодыр', image: 'Moidodyr.jpg', _score: 10 }] }),
    }))
    expect((await searchInventaire('Мойдодыр'))[0].coverUrl).toBeUndefined()
  })

  it('matches part of a Chinese title', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ results: [{ id: 'Q1', label: '好饿的毛毛虫', _score: 10 }] }) }))
    expect((await searchInventaire('毛毛虫'))[0]).toMatchObject({ title: '好饿的毛毛虫', language: 'zh' })
  })

  it('stops asking for as long as a 429 says', async () => {
    let calls = 0
    vi.stubGlobal('fetch', async () => {
      calls++
      return { ok: false, status: 429, headers: new Headers({ 'retry-after': '1800' }) }
    })
    await expect(searchInventaire('Мойдодыр')).rejects.toThrow()
    await expect(searchInventaire('Мойдодыр')).rejects.toThrow(/wait/)
    expect(calls).toBe(1)
  })
})
