export interface Child {
  id: string
  name: string
  birthYear?: number
  // Hex accent colour for the UI while this child is active; unset means the
  // default green. Not indexed, so no schema change was needed.
  colour?: string
  createdAt: string
}

export interface Edition {
  id: string
  title: string
  author: string
  coverUrl?: string
  isbn?: string
  source: 'openlibrary' | 'googlebooks' | 'manual'
  createdAt: string
}

export interface ReadingSession {
  id: string
  childId: string
  editionId: string
  date: string
  note?: string
  rating?: number
  createdAt: string
}

export interface ChangeLogEntry {
  id?: number
  entity: 'child' | 'edition' | 'session'
  entityId: string
  op: 'create' | 'update' | 'delete'
  timestamp: string
  payload: unknown
}

// A photo the parent took of their own copy's cover, for a book the catalogue
// has no cover image for. Kept separate from Edition (rather than a field on
// it) because a Blob can't survive JSON.stringify — see exportBackupJSON.
export interface CoverPhoto {
  editionId: string
  blob: Blob
}

// A local copy of a catalogue cover (Open Library, Google Books), fetched once
// so it still shows offline or when that CDN is unreachable — the URL alone
// (Edition.coverUrl) depends on the network being up every single time it's
// displayed. Deliberately excluded from exportBackupJSON/importBackupJSON: a
// fetched public cover is always re-fetchable from its URL, unlike a
// CoverPhoto, so backing it up would just be bloat for nothing at risk.
export interface CachedCover {
  editionId: string
  blob: Blob
}
