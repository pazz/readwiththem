import { describe, expect, it } from 'vitest'
import { isValidISBN13 } from './isbn'

describe('isValidISBN13', () => {
  it('accepts a valid ISBN-13', () => expect(isValidISBN13('9781845025038')).toBe(true))
  it('rejects a wrong check digit', () => expect(isValidISBN13('9781845025037')).toBe(false))
  it('rejects the wrong length', () => expect(isValidISBN13('123')).toBe(false))
  it('ignores hyphens', () => expect(isValidISBN13('978-1-84502-503-8')).toBe(true))
})
