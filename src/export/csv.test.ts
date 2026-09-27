import { describe, expect, it } from 'vitest'
import { parseCSV, readingsFromCSV, sessionsToCSV } from './csv'

const children = [{ id: 'c1', name: 'Freya', createdAt: '' }]
const editions = [{ id: 'e1', title: 'Stick "Man"', author: 'Julia Donaldson', source: 'manual' as const, createdAt: '' }]
const sessions = [{ id: 's1', childId: 'c1', editionId: 'e1', date: '2026-09-01', rating: 4, note: 'Loved it, again', createdAt: '' }]

describe('CSV', () => {
  it('parses quotes, escaped quotes, embedded commas and line breaks', () => {
    expect(parseCSV('﻿a,"b, c","say ""hi"""\r\n"multi\nline",x,\n\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['multi\nline', 'x', ''],
    ])
  })

  it('reads back exactly what the export writes', () => {
    expect(readingsFromCSV(sessionsToCSV(sessions, children, editions))).toEqual([
      { date: '2026-09-01', child: 'Freya', title: 'Stick "Man"', author: 'Julia Donaldson', rating: 4, note: 'Loved it, again' },
    ])
  })

  it('accepts columns in any order and optional ones missing', () => {
    expect(readingsFromCSV('Title,Child,Date\nThe Gruffalo,Arlo,2026-09-02')).toEqual([
      { date: '2026-09-02', child: 'Arlo', title: 'The Gruffalo', author: '', rating: undefined, note: undefined },
    ])
  })

  it.each([
    ['', /empty/],
    ['child,title\nArlo,X', /including "date"/],
    ['date,child,title\n2/9/2026,Arlo,X', /Row 2: the date/],
    ['date,child,title\n2026-09-02,,X', /Row 2: every reading needs/],
    ['date,child,title,rating\n2026-09-02,Arlo,X,9', /Row 2: a rating/],
  ])('rejects %j with a readable message', (text, message) => {
    expect(() => readingsFromCSV(text)).toThrow(message)
  })
})
