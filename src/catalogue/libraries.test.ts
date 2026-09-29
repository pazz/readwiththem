import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseMarc, uninvertName } from './marc'
import { parseBnfDublinCore } from './bnf'
import { libraryFor } from './nationalLibraries'
import { authorFromDescription, searchInventaire } from './inventaire'
import { lookupISBN, searchCatalogue } from './catalogue'

afterEach(() => vi.unstubAllGlobals())

// Trimmed from real responses.
const dnb = `<?xml version="1.0" encoding="UTF-8"?>
<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/"><numberOfRecords>1</numberOfRecords><records><record><recordData><record xmlns="http://www.loc.gov/MARC21/slim" type="Bibliographic">
  <controlfield tag="001">1378713494</controlfield>
  <controlfield tag="008">251011s2026    gw ||||| |||| 00||||ger  </controlfield>
  <datafield tag="020" ind1=" " ind2=" "><subfield code="a">9783836963947</subfield></datafield>
  <datafield tag="100" ind1="1" ind2=" "><subfield code="a">Carle, Eric</subfield><subfield code="4">aut</subfield></datafield>
  <datafield tag="245" ind1="0" ind2="0"><subfield code="a">¬Die¬ kleine Raupe Nimmersatt &amp; Co. /</subfield><subfield code="c">Eric Carle</subfield></datafield>
</record></recordData></record></records></searchRetrieveResponse>`

const bne = `<searchRetrieveResponse><records><record><recordData><record>
  <controlfield tag="008">170901s2017    sp a   | |||  000 1 spa^^</controlfield>
  <datafield ind1=" " ind2=" " tag="020"><subfield code="a">978-84-8470-561-1</subfield></datafield>
  <datafield ind1="1" ind2=" " tag="100"><subfield code="a">Brown, Margaret Wise</subfield><subfield code="d">1910-1952</subfield></datafield>
  <datafield ind1="1" ind2="0" tag="245"><subfield code="a">Buenas noches, luna</subfield><subfield code="c">Margaret Wise Brown</subfield></datafield>
</record></recordData></record></records></searchRetrieveResponse>`

const bnf = `<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/"><srw:records><srw:record><srw:recordData>
<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/">   <dc:identifier>http://catalogue.bnf.fr/ark:/12148/cb351373111</dc:identifier>   <dc:title>La Petite chenille qui faisait des trous / E. Carle ; traduit de l'anglais</dc:title>   <dc:creator>Carle, Eric (1929-2021). Auteur du texte</dc:creator>   <dc:language>fre</dc:language>
</oai_dc:dc></srw:recordData></srw:record></srw:records></srw:searchRetrieveResponse>`

const inventaire = (labels: Array<[string, string, number]>) => ({
  results: labels.map(([label, description, _score], i) => ({ id: `Q${i}`, label, description, image: `/img/entities/${i}`, _score })),
})

describe('reading library records', () => {
  it('reads a German MARC record, dropping sort marks and entities', () => {
    expect(parseMarc(dnb)).toEqual([{ title: 'Die kleine Raupe Nimmersatt & Co', author: 'Eric Carle', language: 'de' }])
  })
  it('reads a Spanish MARC record whose fields put the tag last', () => {
    expect(parseMarc(bne)).toEqual([{ title: 'Buenas noches, luna', author: 'Margaret Wise Brown', language: 'es' }])
  })
  it('reads a BnF Dublin Core record', () => {
    expect(parseBnfDublinCore(bnf)).toEqual([
      { title: 'La Petite chenille qui faisait des trous', author: 'Eric Carle', language: 'fr', ark: 'ark:/12148/cb351373111' },
    ])
  })
  it('finds nothing in an empty response', () => {
    expect(parseMarc('<searchRetrieveResponse><numberOfRecords>0</numberOfRecords></searchRetrieveResponse>')).toEqual([])
  })
  it('turns an inverted name round', () => {
    expect(uninvertName('Saint-Exupéry, Antoine de (1900-1944)')).toBe('Antoine de Saint-Exupéry')
  })
})

describe('choosing a national library', () => {
  it.each([
    ['9783836963947', 'dnb'],
    ['9782211208994', 'bnf'],
    ['979-10-90636-07-7', 'bnf'],
    ['978-84-8470-561-1', 'bne'],
    ['9781509804757', undefined],
  ])('%s goes to %s', (isbn, library) => expect(libraryFor(isbn)).toBe(library))
})

describe('Inventaire', () => {
  it('reads the author from a description', () => {
    expect(authorFromDescription('Buch von Eric Carle')).toBe('Eric Carle')
    expect(authorFromDescription('Erzählung von Antoine de Saint-Exupéry (1943)')).toBe('Antoine de Saint-Exupéry')
    expect(authorFromDescription('Kinderbuch')).toBe('Unknown')
  })

  it('keeps each work once under the label that matches the query, and drops unrelated ones', async () => {
    vi.stubGlobal('fetch', async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes('lang=de')
          ? inventaire([
              ['Die kleine Raupe Nimmersatt', 'Buch von Eric Carle', 489585],
              ['Der Gott der kleinen Dinge', 'Roman von Arundhati Roy', 645],
            ])
          : inventaire([['The Very Hungry Caterpillar', 'book by Eric Carle', 400000]]),
    }))
    const results = await searchInventaire('Die kleine Raupe Nimmersatt')
    expect(results.map((r) => r.title)).toEqual(['Die kleine Raupe Nimmersatt'])
    expect(results[0]).toMatchObject({
      author: 'Eric Carle',
      language: 'de',
      coverUrl: 'https://inventaire.io/img/entities/0',
      source: 'inventaire',
    })
  })

  it('fails only when every language failed', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500 }))
    await expect(searchInventaire('x')).rejects.toThrow()
  })
})

describe('looking up an ISBN', () => {
  const respond = (routes: Record<string, unknown>) =>
    vi.stubGlobal('fetch', async (url: string) => {
      const host = Object.keys(routes).find((h) => url.includes(h))
      const body = host === undefined ? undefined : routes[host]
      if (body === undefined) return { ok: false, status: 404 }
      return { ok: true, text: async () => String(body), json: async () => body }
    })

  it('asks the German library about a 978-3 barcode and guesses an Open Library cover', async () => {
    respond({ 'services.dnb.de': dnb })
    expect(await lookupISBN('9783836963947')).toEqual({
      title: 'Die kleine Raupe Nimmersatt & Co',
      author: 'Eric Carle',
      isbn: '9783836963947',
      language: 'de',
      coverUrl: 'https://covers.openlibrary.org/b/isbn/9783836963947-M.jpg?default=false',
      source: 'library',
    })
  })

  it('uses a cover Open Library is known to have, with the national title', async () => {
    respond({
      'services.dnb.de': dnb,
      'openlibrary.org/search.json': { docs: [{ title: 'The Very Hungry Caterpillar', cover_i: 7 }] },
    })
    const found = await lookupISBN('9783836963947')
    expect(found?.title).toBe('Die kleine Raupe Nimmersatt & Co')
    expect(found?.coverUrl).toBe('https://covers.openlibrary.org/b/id/7-M.jpg')
  })

  it('offers the BnF cover for a French book', async () => {
    respond({ 'catalogue.bnf.fr': bnf })
    expect((await lookupISBN('9782211208994'))?.coverUrl).toContain('openapi.bnf.fr')
  })

  it('still finds the book when the national library is down', async () => {
    respond({ 'openlibrary.org/search.json': { docs: [{ title: 'Elmer', author_name: ['David McKee'], cover_i: 3 }] } })
    expect(await lookupISBN('9788448839345')).toMatchObject({ title: 'Elmer', language: 'es' })
  })

  it('finds nothing when nobody knows the ISBN', async () => {
    respond({})
    expect(await lookupISBN('9783836963947')).toBeNull()
  })
})

describe('searching in several languages', () => {
  it('puts an Inventaire title first, keeping the ISBN and cover of the Open Library record for the same book', async () => {
    vi.stubGlobal('fetch', async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes('inventaire.io')
          ? inventaire([['Der Grüffelo', 'Buch von Julia Donaldson', 1000]])
          : url.includes('openlibrary.org')
            ? { docs: [{ title: 'Der Grüffelo', author_name: ['Julia Donaldson'], isbn: ['9783407795984'], cover_i: 5 }] }
            : { items: [] },
    }))
    expect(await searchCatalogue('Grüffelo')).toEqual([
      {
        title: 'Der Grüffelo',
        author: 'Julia Donaldson',
        isbn: '9783407795984',
        coverUrl: 'https://covers.openlibrary.org/b/id/5-M.jpg',
        source: 'openlibrary',
      },
    ])
  })

  it('guesses English for a result only Open Library knows, but not for one Inventaire also found', async () => {
    const stub = (inventaireResults: unknown) =>
      vi.stubGlobal('fetch', async (url: string) => ({
        ok: true,
        json: async () =>
          url.includes('inventaire.io')
            ? inventaireResults
            : url.includes('openlibrary.org')
              ? { docs: [{ title: 'Elmer', author_name: ['David McKee'], isbn: ['9780099456414'] }] }
              : { items: [] },
      }))
    stub({ results: [] })
    expect((await searchCatalogue('Elmer'))[0]).toMatchObject({ title: 'Elmer', language: 'en' })
    stub(inventaire([['Elmer', 'Buch von David McKee', 1000]]))
    expect((await searchCatalogue('Elmer'))[0].language).toBeUndefined()
  })
})
