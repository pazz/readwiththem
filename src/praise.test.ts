import { describe, expect, it } from 'vitest'
import { PRAISE_MESSAGES, pickPraise } from './praise'

describe('praise messages', () => {
  it('are twenty distinct templates, each with a {title} placeholder', () => {
    expect(PRAISE_MESSAGES).toHaveLength(20)
    expect(new Set(PRAISE_MESSAGES).size).toBe(PRAISE_MESSAGES.length)
    for (const msg of PRAISE_MESSAGES) expect(msg).toContain('{title}')
  })

  it('substitute the title', () => {
    const { message, template } = pickPraise('The Gruffalo')
    expect(message).toContain('The Gruffalo')
    expect(message).not.toContain('{title}')
    expect(PRAISE_MESSAGES).toContain(template)
  })

  it('can pick every template', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) seen.add(pickPraise('X').template)
    expect(seen.size).toBe(PRAISE_MESSAGES.length)
  })

  it('never repeat the previous template', () => {
    let previous = pickPraise('Book A').template
    for (let i = 0; i < 200; i++) {
      const next = pickPraise(i % 2 === 0 ? 'Book A' : 'Book B', previous).template
      expect(next).not.toBe(previous)
      previous = next
    }
  })
})
