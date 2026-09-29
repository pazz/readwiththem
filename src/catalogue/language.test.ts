import { describe, expect, it } from 'vitest'
import { isLanguageCode, languageFromCode, languageFromISBN, languageName } from './language'

describe('languageFromISBN', () => {
  it.each([
    ['9783836963947', 'de'],
    ['978-2-211-20899-4', 'fr'],
    ['9788484705611', 'es'], // two-digit group 84
    ['9781509804757', 'en'],
    ['9789510123456', 'fi'], // three-digit group 951
    ['9791090636077', 'fr'], // 979-10
  ])('%s is %s', (isbn, language) => expect(languageFromISBN(isbn)).toBe(language))

  it('knows nothing of a group it has no language for, or of a bad ISBN', () => {
    expect(languageFromISBN('9788000000002')).toBeUndefined() // 80: Czech or Slovak
    expect(languageFromISBN('123')).toBeUndefined()
  })
})

describe('languageFromCode', () => {
  it('reads library codes', () => {
    expect(languageFromCode('ger')).toBe('de')
    expect(languageFromCode('fra')).toBe('fr')
    expect(languageFromCode(' SPA ')).toBe('es')
  })
  it('keeps a two-letter code, and gives nothing for the unknown', () => {
    expect(languageFromCode('de')).toBe('de')
    expect(languageFromCode('zzz')).toBeUndefined()
    expect(languageFromCode('   ')).toBeUndefined()
  })
})

describe('language codes', () => {
  it('validates and names them', () => {
    expect(isLanguageCode('de')).toBe(true)
    expect(isLanguageCode('DE')).toBe(false)
    expect(isLanguageCode('ger')).toBe(false)
    expect(languageName('de')).toBe('German')
  })
})
