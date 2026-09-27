import type { ChangeLogEntry, Child, Edition, ReadingSession } from '../types'

// The backup file format. Version 1 is the unversioned format written before
// September 2026, identical apart from the missing header; both restore.
export const BACKUP_FORMAT = 'readwiththem-backup'
export const BACKUP_VERSION = 2

// A Blob can't survive JSON.stringify (it silently becomes "{}"), so
// photographed covers travel as base64.
export interface EncodedPhoto {
  editionId: string
  mimeType: string
  base64: string
}

export interface Backup {
  children: Child[]
  editions: Edition[]
  sessions: ReadingSession[]
  changeLog: ChangeLogEntry[]
  coverPhotos: EncodedPhoto[]
}

export function serialiseBackup(backup: Backup): string {
  return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), ...backup }, null, 2)
}

class BackupError extends Error {}

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const optional = <T>(v: unknown, check: (v: unknown) => v is T): v is T | undefined => v === undefined || check(v)
const isISODate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const isRating = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5
const isYear = (v: unknown): v is number => Number.isInteger(v)
const isColour = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
const SOURCES: ReadonlyArray<Edition['source']> = ['openlibrary', 'googlebooks', 'manual']

function list(data: Json, key: string, required: boolean): unknown[] {
  const value = data[key]
  if (value === undefined && !required) return []
  if (!Array.isArray(value)) throw new BackupError(`That file does not look like a Read With Them backup (no ${key}).`)
  return value
}

function fail(what: string, index: number, problem: string): never {
  throw new BackupError(`That backup is damaged: ${what} ${index + 1} ${problem}.`)
}

/**
 * Parses and checks a backup file before anything is restored: every record
 * must be well formed and every reading must point at a child and a book in
 * the same file. Unknown fields are dropped. Throws a readable error.
 */
export function parseBackup(json: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new BackupError('That file is not valid JSON.')
  }
  if (!isObject(data)) throw new BackupError('That file does not look like a Read With Them backup.')
  if (data.format !== undefined && data.format !== BACKUP_FORMAT)
    throw new BackupError('That file does not look like a Read With Them backup.')
  if (typeof data.version === 'number' && data.version > BACKUP_VERSION) {
    throw new BackupError('That backup was made by a newer version of the app. Reload to update, then try again.')
  }

  const ids = new Set<string>()
  const unique = (id: string, what: string, i: number) => {
    if (ids.has(id)) fail(what, i, 'repeats an id used elsewhere')
    ids.add(id)
  }

  const children = list(data, 'children', true).map((c, i): Child => {
    if (!isObject(c) || !isText(c.id) || !isText(c.name) || !isText(c.createdAt)) fail('child', i, 'is incomplete')
    if (!optional(c.birthYear, isYear) || !optional(c.colour, isColour)) fail('child', i, 'has an invalid birth year or colour')
    unique(c.id, 'child', i)
    return { id: c.id, name: c.name, birthYear: c.birthYear, colour: c.colour, createdAt: c.createdAt }
  })

  const editions = list(data, 'editions', true).map((e, i): Edition => {
    if (!isObject(e) || !isText(e.id) || !isText(e.title) || typeof e.author !== 'string' || !isText(e.createdAt))
      fail('book', i, 'is incomplete')
    if (!SOURCES.includes(e.source as Edition['source'])) fail('book', i, 'has an unknown source')
    if (!optional(e.coverUrl, isText) || !optional(e.isbn, isText)) fail('book', i, 'has an invalid cover or ISBN')
    unique(e.id, 'book', i)
    return {
      id: e.id,
      title: e.title,
      author: e.author,
      coverUrl: e.coverUrl,
      isbn: e.isbn,
      source: e.source as Edition['source'],
      createdAt: e.createdAt,
    }
  })

  const childIds = new Set(children.map((c) => c.id))
  const editionIds = new Set(editions.map((e) => e.id))
  const sessions = list(data, 'sessions', true).map((s, i): ReadingSession => {
    if (!isObject(s) || !isText(s.id) || !isText(s.createdAt)) fail('reading', i, 'is incomplete')
    if (!isISODate(s.date)) fail('reading', i, 'has no valid date')
    if (!isText(s.childId) || !childIds.has(s.childId)) fail('reading', i, 'belongs to a child not in the backup')
    if (!isText(s.editionId) || !editionIds.has(s.editionId)) fail('reading', i, 'is of a book not in the backup')
    if (!optional(s.note, (v): v is string => typeof v === 'string') || !optional(s.rating, isRating))
      fail('reading', i, 'has an invalid note or rating')
    unique(s.id, 'reading', i)
    return { id: s.id, childId: s.childId, editionId: s.editionId, date: s.date, note: s.note, rating: s.rating, createdAt: s.createdAt }
  })

  const changeLog = list(data, 'changeLog', false).map((entry, i): ChangeLogEntry => {
    if (!isObject(entry) || !isText(entry.entity) || !isText(entry.entityId) || !isText(entry.op) || !isText(entry.timestamp)) {
      fail('change log entry', i, 'is incomplete')
    }
    return entry as unknown as ChangeLogEntry
  })

  const coverPhotos = list(data, 'coverPhotos', false).map((p, i): EncodedPhoto => {
    if (!isObject(p) || !isText(p.editionId) || !isText(p.mimeType) || !isText(p.base64)) fail('cover photo', i, 'is incomplete')
    if (!editionIds.has(p.editionId)) fail('cover photo', i, 'is of a book not in the backup')
    return { editionId: p.editionId, mimeType: p.mimeType, base64: p.base64 }
  })

  return { children, editions, sessions, changeLog, coverPhotos }
}

export async function encodePhoto(editionId: string, blob: Blob): Promise<EncodedPhoto> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return { editionId, mimeType: blob.type, base64: btoa(binary) }
}

export function decodePhoto({ base64, mimeType }: EncodedPhoto): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}
