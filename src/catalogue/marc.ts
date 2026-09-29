import { attribute, elements, rawText, text } from './xml'
import { languageFromCode } from './language'

// MARC21 records as served by the German National Library and the Biblioteca
// Nacional de España: field 245 holds the title and 100 (else 700) the author.

export interface CatalogueRecord {
  title: string
  author?: string
  language?: string
}

// Sort-order marks in library titles: "¬Die¬ kleine Raupe", "<<La>> oruga".
function tidyTitle(title: string): string {
  return title
    .replace(/[\u0088\u0089\u0098\u009c¬]|<<|>>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s/:;,.=]+$/, '')
    .trim()
}

/** "Brown, Margaret Wise" becomes "Margaret Wise Brown". */
export function uninvertName(name: string): string {
  const cleaned = name.replace(/\s*\([^)]*\)/g, '').replace(/[\s,.]+$/, '')
  const comma = cleaned.indexOf(',')
  return comma < 0 ? cleaned : `${cleaned.slice(comma + 1).trim()} ${cleaned.slice(0, comma).trim()}`.trim()
}

export function parseMarc(xml: string): CatalogueRecord[] {
  const records: CatalogueRecord[] = []
  for (const data of elements(xml, 'recordData')) {
    const fields = elements(data.inner, 'datafield')
    const subfield = (tag: string, code: string) => {
      const field = fields.find((f) => attribute(f, 'tag') === tag)
      return field && text(elements(field.inner, 'subfield').find((s) => attribute(s, 'code') === code))
    }
    const title = tidyTitle(subfield('245', 'a') ?? '')
    if (!title) continue
    const author = subfield('100', 'a') ?? subfield('700', 'a')
    // Field 008 holds the language at characters 35 to 37; 041 says it in words.
    const fixed = rawText(elements(data.inner, 'controlfield').find((f) => attribute(f, 'tag') === '008'))
    const language = languageFromCode(fixed?.slice(35, 38)) ?? languageFromCode(subfield('041', 'a'))
    records.push({ title, author: author ? uninvertName(author) : undefined, language })
  }
  return records
}
