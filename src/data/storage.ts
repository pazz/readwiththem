// Single storage-adapter boundary: every screen calls these functions, never `db` directly.
// Swapping IndexedDB for a networked adapter later means changing this file, not the UI.
import { db } from './db'
import { generateId } from '../lib/id'
import { fetchImageBlob } from '../covers/canvasImage'
import { OVERSIZED_BYTES, shrinkCover } from '../covers/coverImage'
import { decodePhoto, encodePhoto, parseBackup, serialiseBackup } from './backup'
import type { ImportedReading } from '../export/csv'
import type { Child, Edition, ReadingSession, CoverPhoto } from '../types'

async function logChange(entity: 'child' | 'edition' | 'session', entityId: string, op: 'create' | 'update' | 'delete', payload: unknown) {
  await db.changeLog.add({ entity, entityId, op, timestamp: new Date().toISOString(), payload })
}

export async function addChild(name: string, birthYear?: number): Promise<Child> {
  const child: Child = { id: generateId(), name, birthYear, createdAt: new Date().toISOString() }
  await db.children.add(child)
  await logChange('child', child.id, 'create', child)
  return child
}

export async function updateChild(id: string, changes: Partial<Pick<Child, 'name' | 'birthYear' | 'colour'>>): Promise<void> {
  await db.children.update(id, changes)
  await logChange('child', id, 'update', changes)
}

export function listChildren(): Promise<Child[]> {
  return db.children.orderBy('name').toArray()
}

export async function addEdition(edition: Omit<Edition, 'id' | 'createdAt'>): Promise<Edition> {
  if (edition.isbn) {
    const existing = await db.editions.where('isbn').equals(edition.isbn).first()
    if (existing) return existing
  } else {
    // Without an ISBN there is no key to match on, so fall back to title+author:
    // otherwise re-logging the same manual entry mints a new edition each time
    // and the same book shows up repeatedly as if it were several books.
    const existing = await db.editions.filter((e) => !e.isbn && e.title === edition.title && e.author === edition.author).first()
    if (existing) return existing
  }
  const full: Edition = { ...edition, id: generateId(), createdAt: new Date().toISOString() }
  await db.editions.add(full)
  await logChange('edition', full.id, 'create', full)
  // Not awaited: logging a reading shouldn't stall on a network fetch. A
  // failure here is silent and harmless — the cover just falls back to
  // fetching live next time it's shown, same as before this cache existed.
  if (full.coverUrl) cacheCoverIfMissing(full.id, full.coverUrl)
  return full
}

export function listEditions(): Promise<Edition[]> {
  return db.editions.orderBy('title').toArray()
}

/**
 * A local copy of a catalogue cover, fetched once so display no longer
 * depends on that CDN being reachable every single time — see CachedCover.
 * Not part of the changeLog: it's a resilience cache, not household data,
 * and re-populating it after a restore isn't something anyone needs to see.
 */
export async function cacheCoverIfMissing(editionId: string, coverUrl: string): Promise<void> {
  const existing = await db.coverCache.get(editionId)
  if (existing) return
  const blob = await fetchImageBlob(coverUrl)
  if (!blob) return
  await db.coverCache.put({ editionId, blob })
}

export function listCachedCovers() {
  return db.coverCache.toArray()
}

export async function logReading(input: {
  childId: string
  editionId: string
  date: string
  note?: string
  rating?: number
}): Promise<ReadingSession> {
  const session: ReadingSession = { ...input, id: generateId(), createdAt: new Date().toISOString() }
  await db.sessions.add(session)
  await logChange('session', session.id, 'create', session)
  return session
}

/**
 * Newest first by the day the book was read, and within a single day by when
 * the entry was actually made. `createdAt` is never shown anywhere in the UI —
 * it exists only to break ties here, so that several books logged on the same
 * evening keep a stable, meaningful order instead of an arbitrary one.
 */
export async function listSessions(): Promise<ReadingSession[]> {
  const sessions = await db.sessions.toArray()
  return sessions.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
}

export async function updateSession(
  id: string,
  changes: Partial<Pick<ReadingSession, 'childId' | 'date' | 'note' | 'rating'>>,
): Promise<void> {
  await db.sessions.update(id, changes)
  await logChange('session', id, 'update', changes)
}

export async function updateEdition(id: string, changes: Partial<Pick<Edition, 'title' | 'author'>>): Promise<void> {
  await db.editions.update(id, changes)
  await logChange('edition', id, 'update', changes)
}

export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id)
  await logChange('session', id, 'delete', { id })
}

// Removing a child also removes their reading sessions — an orphaned session
// would otherwise sit in history and every export against no one, forever.
// Reuses deleteSession so each one is logged individually, same as a parent
// deleting them one by one.
export async function deleteChild(id: string): Promise<void> {
  const sessions = await db.sessions.where('childId').equals(id).toArray()
  for (const s of sessions) await deleteSession(s.id)
  await db.children.delete(id)
  await logChange('child', id, 'delete', { id })
}

export async function saveCoverPhoto(editionId: string, blob: Blob): Promise<void> {
  await db.coverPhotos.put({ editionId, blob })
  await logChange('edition', editionId, 'update', { coverPhoto: true })
}

/**
 * Re-encodes cover images stored before the size limits in coverImage.ts, in
 * both the photo store and the catalogue cache, so they stop weighing down
 * storage and every backup. Idempotent: re-encoded covers fall well under the
 * threshold, so later runs find nothing to do. Not in the changeLog: the
 * picture is the same, only its encoding changed. Returns how many shrank.
 */
export async function shrinkOversizedCovers(): Promise<number> {
  let shrunk = 0
  for (const table of [db.coverPhotos, db.coverCache]) {
    const oversized = (await table.toArray()).filter((c) => c.blob.size > OVERSIZED_BYTES)
    for (const cover of oversized) {
      try {
        const blob = await shrinkCover(cover.blob)
        if (blob && blob.size < cover.blob.size) {
          await table.put({ editionId: cover.editionId, blob })
          shrunk++
        }
      } catch (err) {
        // An undecodable blob is left alone rather than lost.
        console.warn('could not shrink cover', cover.editionId, err)
      }
    }
  }
  return shrunk
}

export function listCoverPhotos(): Promise<CoverPhoto[]> {
  return db.coverPhotos.toArray()
}

/**
 * Adds readings from a spreadsheet to what is already here. Children are
 * matched by name (a new name adds a child) and books by title and author,
 * ignoring case; a
 * row identical to an existing reading is skipped, so importing the same file
 * twice changes nothing.
 */
export async function importReadings(rows: ImportedReading[]): Promise<{ added: number; skipped: number; newChildren: string[] }> {
  const childByName = new Map((await listChildren()).map((c) => [c.name.toLowerCase(), c]))
  const bookKey = (title: string, author: string) => `${title}|${author}`.toLowerCase()
  const editionByKey = new Map((await listEditions()).map((e) => [bookKey(e.title, e.author), e]))
  const existing = new Set((await db.sessions.toArray()).map(readingKey))
  const newChildren: string[] = []
  let added = 0
  for (const row of rows) {
    let child = childByName.get(row.child.toLowerCase())
    if (!child) {
      child = await addChild(row.child)
      childByName.set(row.child.toLowerCase(), child)
      newChildren.push(row.child)
    }
    const author = row.author || 'Unknown'
    let edition = editionByKey.get(bookKey(row.title, author))
    if (!edition) {
      edition = await addEdition({ title: row.title, author, source: 'manual' })
      editionByKey.set(bookKey(row.title, author), edition)
    }
    const reading = { childId: child.id, editionId: edition.id, date: row.date, note: row.note, rating: row.rating }
    if (existing.has(readingKey(reading))) continue
    existing.add(readingKey(reading))
    await logReading(reading)
    added++
  }
  return { added, skipped: rows.length - added, newChildren }
}

const readingKey = (r: Pick<ReadingSession, 'childId' | 'editionId' | 'date' | 'note'>) =>
  [r.childId, r.editionId, r.date, r.note ?? ''].join('|')

export async function exportBackupJSON(): Promise<string> {
  const [children, editions, sessions, changeLog, coverPhotos] = await Promise.all([
    db.children.toArray(),
    db.editions.toArray(),
    db.sessions.toArray(),
    db.changeLog.toArray(),
    db.coverPhotos.toArray(),
  ])
  return serialiseBackup({
    children,
    editions,
    sessions,
    changeLog,
    coverPhotos: await Promise.all(coverPhotos.map((p) => encodePhoto(p.editionId, p.blob))),
  })
}

/**
 * Restores a backup, replacing everything currently in this browser rather
 * than merging: a merge would silently mix two points in time. The file is
 * checked in full first, so a damaged one changes nothing.
 */
export async function importBackupJSON(json: string): Promise<void> {
  const backup = parseBackup(json)
  const coverPhotos: CoverPhoto[] = backup.coverPhotos.map((p) => ({ editionId: p.editionId, blob: decodePhoto(p) }))
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await Promise.all([
      db.children.bulkAdd(backup.children),
      db.editions.bulkAdd(backup.editions),
      db.sessions.bulkAdd(backup.sessions),
      db.changeLog.bulkAdd(backup.changeLog),
      db.coverPhotos.bulkAdd(coverPhotos),
    ])
  })
}

// The nuclear option, next to backup/restore in Settings: wipes every table,
// with nothing kept and nowhere else this data lives.
export async function resetAllData(): Promise<void> {
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear())))
}

/**
 * Asks the browser not to clear this app's storage when space runs low (by
 * default it may, and Safari does for sites not added to the home screen).
 * Resolves to whether storage is now persistent; false where unsupported.
 */
export async function ensurePersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  return (await navigator.storage.persisted()) || navigator.storage.persist()
}
