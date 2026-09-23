import Dexie, { type EntityTable } from 'dexie'
import type { Child, Edition, ReadingSession, ChangeLogEntry, CoverPhoto } from './types'

export class ReadWithThemDB extends Dexie {
  children!: EntityTable<Child, 'id'>
  editions!: EntityTable<Edition, 'id'>
  sessions!: EntityTable<ReadingSession, 'id'>
  changeLog!: EntityTable<ChangeLogEntry, 'id'>
  coverPhotos!: EntityTable<CoverPhoto, 'editionId'>

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
  }
}

export const db = new ReadWithThemDB()
