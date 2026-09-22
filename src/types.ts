export interface Child {
  id: string
  name: string
  birthYear?: number
  createdAt: string
}

export interface Edition {
  id: string
  title: string
  author: string
  coverUrl?: string
  isbn?: string
  source: 'openlibrary' | 'manual'
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
