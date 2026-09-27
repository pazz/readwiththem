// All dates in the app are local calendar days as "YYYY-MM-DD" strings.

// Deliberately not d.toISOString().slice(0, 10): that converts to UTC first,
// which shifts the date by a day whenever the local offset crosses midnight.
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

export function startOfWeek(d: Date): Date {
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return monday
}

export function endOfWeek(d: Date): Date {
  const sunday = startOfWeek(d)
  sunday.setDate(sunday.getDate() + 6)
  return sunday
}

// An empty bound means unbounded, so the same range powers "this month" and "all time".
export function formatDateRangeLabel(from: string, to: string): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  if (!from && !to) return 'All time'
  if (!from) return `Up to ${fmt(parseISODate(to))}`
  if (!to) return `From ${fmt(parseISODate(from))}`

  const fromDate = parseISODate(from)
  const toDate = parseISODate(to)
  const isFullMonth =
    fromDate.getDate() === 1 &&
    fromDate.getMonth() === toDate.getMonth() &&
    fromDate.getFullYear() === toDate.getFullYear() &&
    toISODate(toDate) === toISODate(endOfMonth(fromDate))
  if (isFullMonth) return fromDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  return `${fmt(fromDate)} – ${fmt(toDate)}`
}
