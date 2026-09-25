// Single storage-adapter boundary: every screen calls these functions, never `db` directly.
// Swapping IndexedDB for a networked adapter later means changing this file, not the UI.
import { db } from './db'
import { generateId } from './id'
import type { Child, Edition, ReadingSession, CoverPhoto, ChangeLogEntry } from './types'

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
    const existing = await db.editions
      .filter((e) => !e.isbn && e.title === edition.title && e.author === edition.author)
      .first()
    if (existing) return existing
  }
  const full: Edition = { ...edition, id: generateId(), createdAt: new Date().toISOString() }
  await db.editions.add(full)
  await logChange('edition', full.id, 'create', full)
  return full
}

export function listEditions(): Promise<Edition[]> {
  return db.editions.orderBy('title').toArray()
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

export function listCoverPhotos(): Promise<CoverPhoto[]> {
  return db.coverPhotos.toArray()
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

export async function exportBackupJSON(): Promise<string> {
  const [children, editions, sessions, changeLog, coverPhotos] = await Promise.all([
    db.children.toArray(),
    db.editions.toArray(),
    db.sessions.toArray(),
    db.changeLog.toArray(),
    db.coverPhotos.toArray(),
  ])
  // A Blob can't survive JSON.stringify (it silently becomes "{}"), which would
  // quietly drop every photographed cover from the one backup this app has.
  const coverPhotosEncoded = await Promise.all(
    coverPhotos.map(async (p) => ({ editionId: p.editionId, mimeType: p.blob.type, base64: await blobToBase64(p.blob) })),
  )
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), children, editions, sessions, changeLog, coverPhotos: coverPhotosEncoded },
    null,
    2,
  )
}

/**
 * The counterpart to exportBackupJSON — restores a backup taken with it. This
 * replaces everything currently in this browser rather than merging: a merge
 * would leave behind whatever was added, or leave present whatever was
 * deleted, since the backup was taken, silently mixing two points in time.
 */
export async function importBackupJSON(json: string): Promise<void> {
  let data: {
    children?: Child[]
    editions?: Edition[]
    sessions?: ReadingSession[]
    changeLog?: ChangeLogEntry[]
    coverPhotos?: Array<{ editionId: string; mimeType: string; base64: string }>
  }
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (!Array.isArray(data.children) || !Array.isArray(data.editions) || !Array.isArray(data.sessions)) {
    throw new Error('That file does not look like a Read With Them backup.')
  }

  const coverPhotos: CoverPhoto[] = (data.coverPhotos ?? []).map((p) => ({
    editionId: p.editionId,
    blob: base64ToBlob(p.base64, p.mimeType),
  }))

  await db.transaction('rw', db.children, db.editions, db.sessions, db.changeLog, db.coverPhotos, async () => {
    await Promise.all([db.children.clear(), db.editions.clear(), db.sessions.clear(), db.changeLog.clear(), db.coverPhotos.clear()])
    await Promise.all([
      db.children.bulkAdd(data.children!),
      db.editions.bulkAdd(data.editions!),
      db.sessions.bulkAdd(data.sessions!),
      data.changeLog?.length ? db.changeLog.bulkAdd(data.changeLog) : Promise.resolve(),
      coverPhotos.length ? db.coverPhotos.bulkAdd(coverPhotos) : Promise.resolve(),
    ])
  })
}

// The nuclear option, next to backup/restore in Settings — wipes every table,
// with nothing kept and nowhere else this data lives.
export async function resetAllData(): Promise<void> {
  await db.transaction('rw', db.children, db.editions, db.sessions, db.changeLog, db.coverPhotos, async () => {
    await Promise.all([db.children.clear(), db.editions.clear(), db.sessions.clear(), db.changeLog.clear(), db.coverPhotos.clear()])
  })
}

export function sessionsToCSV(sessions: ReadingSession[], children: Child[], editions: Edition[]): string {
  const childById = new Map(children.map((c) => [c.id, c]))
  const editionById = new Map(editions.map((e) => [e.id, e]))
  const header = ['date', 'child', 'title', 'author', 'rating', 'note']
  const rows = sessions.map((s) => [
    s.date,
    childById.get(s.childId)?.name ?? '',
    editionById.get(s.editionId)?.title ?? '',
    editionById.get(s.editionId)?.author ?? '',
    s.rating?.toString() ?? '',
    s.note ?? '',
  ])
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\n')
}

export async function exportSessionsCSV(): Promise<string> {
  const [sessions, children, editions] = await Promise.all([listSessions(), listChildren(), listEditions()])
  return sessionsToCSV(sessions, children, editions)
}
