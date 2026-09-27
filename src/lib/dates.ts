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

export function startOfWeek(d: Date, weekStart: 'monday' | 'sunday'): Date {
  const first = new Date(d)
  const offset = weekStart === 'monday' ? (d.getDay() + 6) % 7 : d.getDay()
  first.setDate(d.getDate() - offset)
  return first
}

export function endOfWeek(d: Date, weekStart: 'monday' | 'sunday'): Date {
  const last = startOfWeek(d, weekStart)
  last.setDate(last.getDate() + 6)
  return last
}

// The current week, month or year, as inclusive ISO dates.
export function periodRange(period: 'week' | 'month' | 'year', weekStart: 'monday' | 'sunday', now = new Date()): [string, string] {
  if (period === 'week') return [toISODate(startOfWeek(now, weekStart)), toISODate(endOfWeek(now, weekStart))]
  if (period === 'month') return [toISODate(startOfMonth(now)), toISODate(endOfMonth(now))]
  return [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`]
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

// Spelt out rather than left to toLocaleDateString, whose abbreviations
// ("Sept", a comma after the weekday) vary between browsers.
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const formatDay = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`

// "Sat 12 Sep 2026", for showing a reading's date.
export function formatDisplayDate(iso: string): string {
  const d = parseISODate(iso)
  return `${WEEKDAYS[d.getDay()]} ${formatDay(d)}`
}

// An empty bound means unbounded, so the same range powers "this month" and "all time".
export function formatDateRangeLabel(from: string, to: string): string {
  const fmt = formatDay
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
