import type { Child, Edition, ReadingSession } from '../types'

// One row per reading, every field quoted.
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

// A reading as read from a spreadsheet, before it is matched to children and books.
export interface ImportedReading {
  date: string
  child: string
  title: string
  author: string
  rating?: number
  note?: string
}

// RFC 4180: comma-separated, fields optionally in double quotes, "" for a
// literal quote, line breaks allowed inside quotes.
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field || row.length) rows.push([...row, field])
  return rows.filter((r) => r.some((f) => f.trim()))
}

/**
 * Reads readings from a spreadsheet in the export's own layout: a header row
 * naming at least date, child and title (author, rating and note optional, in
 * any order). Throws a readable error naming the first bad row.
 */
export function readingsFromCSV(text: string): ImportedReading[] {
  const [header, ...rows] = parseCSV(text)
  if (!header) throw new Error('That file is empty.')
  const column = new Map(header.map((name, i) => [name.trim().toLowerCase(), i]))
  for (const required of ['date', 'child', 'title']) {
    if (!column.has(required)) throw new Error(`The first row must name the columns, including "${required}".`)
  }
  const cell = (row: string[], name: string) => (column.has(name) ? (row[column.get(name)!] ?? '').trim() : '')
  return rows.map((row, i) => {
    const line = i + 2
    const date = cell(row, 'date')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Row ${line}: the date must look like 2026-09-27.`)
    const child = cell(row, 'child')
    const title = cell(row, 'title')
    if (!child || !title) throw new Error(`Row ${line}: every reading needs a child and a title.`)
    const ratingText = cell(row, 'rating')
    const rating = ratingText ? Number(ratingText) : undefined
    if (rating !== undefined && !(Number.isInteger(rating) && rating >= 1 && rating <= 5))
      throw new Error(`Row ${line}: a rating must be 1 to 5.`)
    return { date, child, title, author: cell(row, 'author'), rating, note: cell(row, 'note') || undefined }
  })
}
