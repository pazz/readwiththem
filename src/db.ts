import Dexie, { type EntityTable } from 'dexie'
import type { Child, Edition, ReadingSession, ChangeLogEntry } from './types'

export class ReadWithThemDB extends Dexie {
  children!: EntityTable<Child, 'id'>
  editions!: EntityTable<Edition, 'id'>
  sessions!: EntityTable<ReadingSession, 'id'>
  changeLog!: EntityTable<ChangeLogEntry, 'id'>

  constructor() {
    super('readwiththem')
    this.version(1).stores({
      children: 'id, name',
      editions: 'id, title, isbn',
      sessions: 'id, childId, editionId, date',
      changeLog: '++id, entity, entityId, timestamp',
    })
  }
}

export const db = new ReadWithThemDB()
