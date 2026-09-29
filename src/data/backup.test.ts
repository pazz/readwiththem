import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, decodePhoto, encodePhoto, parseBackup, serialiseBackup, type Backup } from './backup'

const child = { id: 'c1', name: 'Freya', createdAt: '2026-01-01T00:00:00Z' }
const edition = {
  id: 'e1',
  title: 'The Gruffalo',
  author: 'Julia Donaldson',
  source: 'openlibrary' as const,
  createdAt: '2026-01-01T00:00:00Z',
}
const session = { id: 's1', childId: 'c1', editionId: 'e1', date: '2026-09-01', rating: 4, createdAt: '2026-09-01T19:00:00Z' }
const valid: Backup = { children: [child], editions: [edition], sessions: [session], changeLog: [], coverPhotos: [] }
const withChange = (change: (b: Record<string, unknown>) => void) => {
  const b = JSON.parse(serialiseBackup(valid))
  change(b)
  return JSON.stringify(b)
}

describe('parseBackup', () => {
  it('round-trips a backup, stamped with format and version', () => {
    const json = serialiseBackup(valid)
    expect(JSON.parse(json)).toMatchObject({ format: 'readwiththem-backup', version: BACKUP_VERSION })
    expect(parseBackup(json)).toEqual(valid)
  })

  it("keeps a book's language, and refuses one that is not a two-letter code", () => {
    const german = { ...valid, editions: [{ ...edition, language: 'de' }] }
    expect(parseBackup(serialiseBackup(german)).editions[0].language).toBe('de')
    expect(() => parseBackup(withChange((b) => ((b.editions as Array<Record<string, unknown>>)[0].language = 'German')))).toThrow(
      /language/,
    )
  })

  it('still restores the unversioned format, without change log or photos', () => {
    const v1 = JSON.stringify({ exportedAt: '2026-09-01', children: [child], editions: [edition], sessions: [session] })
    expect(parseBackup(v1)).toEqual(valid)
  })

  it('drops unknown fields', () => {
    const parsed = parseBackup(withChange((b) => ((b.children as object[])[0] = { ...child, extra: 1 })))
    expect(parsed.children[0]).not.toHaveProperty('extra')
  })

  it.each([
    ['not JSON', () => 'nope', /not valid JSON/],
    ['another format', () => withChange((b) => (b.format = 'something-else')), /does not look like/],
    ['a newer version', () => withChange((b) => (b.version = BACKUP_VERSION + 1)), /newer version/],
    ['missing readings', () => withChange((b) => delete b.sessions), /no sessions/],
    [
      'a reading of an unknown child',
      () => withChange((b) => ((b.sessions as { childId: string }[])[0].childId = 'nobody')),
      /reading 1 belongs to a child/,
    ],
    ['a bad date', () => withChange((b) => ((b.sessions as { date: string }[])[0].date = '1/9/2026')), /reading 1 has no valid date/],
    ['a rating of 7', () => withChange((b) => ((b.sessions as { rating: number }[])[0].rating = 7)), /invalid note or rating/],
    ['a repeated id', () => withChange((b) => (b.editions as object[]).push(edition)), /repeats an id/],
  ])('rejects %s with a readable message', (_, json, message) => {
    expect(() => parseBackup(json())).toThrow(message)
  })
})

describe('photo encoding', () => {
  it('round-trips a blob through base64', async () => {
    const blob = new Blob([new Uint8Array([0, 1, 254, 255])], { type: 'image/jpeg' })
    const decoded = decodePhoto(await encodePhoto('e1', blob))
    expect(decoded.type).toBe('image/jpeg')
    expect([...new Uint8Array(await decoded.arrayBuffer())]).toEqual([0, 1, 254, 255])
  })
})
