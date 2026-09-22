// Single storage-adapter boundary: every screen calls these functions, never `db` directly.
// Swapping IndexedDB for a networked adapter later means changing this file, not the UI.
import { db } from './db'
import { generateId } from './id'
import type { Child, Edition, ReadingSession } from './types'

async function logChange(entity: 'child' | 'edition' | 'session', entityId: string, op: 'create' | 'update' | 'delete', payload: unknown) {
  await db.changeLog.add({ entity, entityId, op, timestamp: new Date().toISOString(), payload })
}

export async function addChild(name: string, birthYear?: number): Promise<Child> {
  const child: Child = { id: generateId(), name, birthYear, createdAt: new Date().toISOString() }
  await db.children.add(child)
  await logChange('child', child.id, 'create', child)
  return child
}

export function listChildren(): Promise<Child[]> {
  return db.children.orderBy('name').toArray()
}

export async function addEdition(edition: Omit<Edition, 'id' | 'createdAt'>): Promise<Edition> {
  if (edition.isbn) {
    const existing = await db.editions.where('isbn').equals(edition.isbn).first()
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

export function listSessions(): Promise<ReadingSession[]> {
  return db.sessions.orderBy('date').reverse().toArray()
}

export async function exportBackupJSON(): Promise<string> {
  const [children, editions, sessions, changeLog] = await Promise.all([
    db.children.toArray(),
    db.editions.toArray(),
    db.sessions.toArray(),
    db.changeLog.toArray(),
  ])
  return JSON.stringify({ exportedAt: new Date().toISOString(), children, editions, sessions, changeLog }, null, 2)
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
