import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readPref, writePref } from './prefs'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  })
})

describe('prefs', () => {
  it('falls back to defaults', () => {
    expect(readPref('theme')).toBe('system')
    expect(readPref('readingGoal')).toEqual({ period: 'off', target: 10 })
  })

  it('round-trips values, and null restores the default', () => {
    writePref('exportOptions', { format: 'csv', showCovers: false, showNotes: true, showCounts: true })
    expect(readPref('exportOptions').format).toBe('csv')
    writePref('exportOptions', null)
    expect(readPref('exportOptions').format).toBe('text')
  })

  it('reads bare strings stored by earlier versions', () => {
    store.set('activeChildId', '3f2a-uuid')
    store.set('bookOrder', 'count')
    expect(readPref('activeChildId')).toBe('3f2a-uuid')
    expect(readPref('bookOrder')).toBe('count')
  })

  it('ignores invalid stored values', () => {
    store.set('theme', '"purple"')
    store.set('readingGoal', '1000')
    expect(readPref('theme')).toBe('system')
    expect(readPref('readingGoal')).toEqual({ period: 'off', target: 10 })
  })

  it('survives storage being unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readPref('weekStart')).toBe('monday')
    expect(() => writePref('weekStart', 'sunday')).not.toThrow()
  })
})
