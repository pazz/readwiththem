import Dexie, { type EntityTable } from 'dexie'
import type { Child, Edition, ReadingSession, ChangeLogEntry, CoverPhoto, CachedCover } from './types'

export class ReadWithThemDB extends Dexie {
  children!: EntityTable<Child, 'id'>
  editions!: EntityTable<Edition, 'id'>
  sessions!: EntityTable<ReadingSession, 'id'>
  changeLog!: EntityTable<ChangeLogEntry, 'id'>
  coverPhotos!: EntityTable<CoverPhoto, 'editionId'>
  coverCache!: EntityTable<CachedCover, 'editionId'>

  constructor() {
    super('readwiththem')
    this.version(1).stores({
      children: 'id, name',
      editions: 'id, title, isbn',
      sessions: 'id, childId, editionId, date',
      changeLog: '++id, entity, entityId, timestamp',
    })
    // Additive: existing installs upgrade without touching the stores above.
    this.version(2).stores({
      coverPhotos: 'editionId',
    })
    this.version(3).stores({
      coverCache: 'editionId',
    })
  }
}

export const db = new ReadWithThemDB()

// If another tab (or a backgrounded installed-app instance) is still open on
// an older schema version — very possible with a PWA, which doesn't reliably
// reload just because a background tab exists — the browser blocks this
// tab's connection until that one closes, with no error and no timeout: every
// read and write here just hangs. This tells an OLD tab to get out of the
// way the moment a newer one needs to open, so it can never be the one
// blocking; reloading it also brings it up to date rather than leaving it
// running with a closed, now-unusable connection.
db.on('versionchange', () => {
  db.close()
  window.location.reload()
})
