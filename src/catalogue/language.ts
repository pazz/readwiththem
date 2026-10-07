// Which language a book is in, as a two-letter ISO 639-1 code ("de").
import type { Edition } from '../types'

// An ISBN's registration group tells which language area or country its
// publisher belongs to. That is a good guess for a book's language, not proof:
// a French publisher can issue a German book. The library's own record, or
// the person, outranks it.
const GROUPS: Record<string, string> = {
  '9780': 'en',
  '9781': 'en',
  '9782': 'fr',
  '9783': 'de',
  '9784': 'ja',
  '9785': 'ru',
  '9787': 'zh',
  '97865': 'pt', // Brazil
  '97882': 'no',
  '97883': 'pl',
  '97884': 'es',
  '97885': 'pt',
  '97887': 'da',
  '97888': 'it',
  '97889': 'ko',
  '97890': 'nl',
  '97891': 'sv',
  '978602': 'id',
  '978604': 'vi',
  '978605': 'tr',
  '978617': 'uk',
  '978618': 'el',
  '978623': 'id',
  '978626': 'zh', // Taiwan
  '978951': 'fi',
  '978952': 'fi',
  '978953': 'hr',
  '978954': 'bg',
  '978957': 'zh', // Taiwan
  '978960': 'el',
  '978966': 'uk',
  '978972': 'pt',
  '978975': 'tr',
  '978984': 'bn',
  '978986': 'zh', // Taiwan
  '978989': 'pt',
  '97910': 'fr',
  '97911': 'ko',
  '97912': 'it',
}

export function languageFromISBN(isbn: string): string | undefined {
  const digits = isbn.replace(/[^0-9]/g, '')
  if (digits.length !== 13) return undefined
  for (const length of [6, 5, 4]) {
    const language = GROUPS[digits.slice(0, length)]
    if (language) return language
  }
  return undefined
}

// When nothing says which language a search result is in, a guess from where
// it came from: Open Library files a work under its English title, so an
// unmarked result is most likely English. Google Books names its language,
// Inventaire's is read from the title that matched, and a national library
// (found by the ISBN's prefix) is covered by the prefix.
export const SOURCE_DEFAULT_LANGUAGE: Partial<Record<Edition['source'], string>> = { openlibrary: 'en' }

// Library records use three-letter codes (MARC "ger", "fre"; also "deu",
// "fra" for the same languages).
const THREE_LETTER: Record<string, string> = {
  eng: 'en',
  fre: 'fr',
  fra: 'fr',
  ger: 'de',
  deu: 'de',
  spa: 'es',
  ita: 'it',
  dut: 'nl',
  nld: 'nl',
  por: 'pt',
  swe: 'sv',
  dan: 'da',
  nor: 'no',
  fin: 'fi',
  pol: 'pl',
  rus: 'ru',
  jpn: 'ja',
  chi: 'zh',
  zho: 'zh',
  kor: 'ko',
  tur: 'tr',
  cat: 'ca',
  wel: 'cy',
  cym: 'cy',
  gre: 'el',
  ell: 'el',
  ara: 'ar',
  heb: 'he',
  cze: 'cs',
  ces: 'cs',
  hun: 'hu',
  ukr: 'uk',
}

/** "ger" becomes "de"; a code that is already two letters is kept; anything unknown gives undefined. */
export function languageFromCode(code: string | undefined): string | undefined {
  const c = code?.trim().toLowerCase()
  if (!c) return undefined
  if (/^[a-z]{2}$/.test(c)) return c
  return THREE_LETTER[c]
}

export const isLanguageCode = (v: unknown): v is string => typeof v === 'string' && /^[a-z]{2}$/.test(v)

// What the person can pick when correcting a book.
export const COMMON_LANGUAGES = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'sv', 'da', 'no', 'fi', 'pl', 'tr', 'ru', 'ja', 'zh'] as const

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}
