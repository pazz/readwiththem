import { useSyncExternalStore } from 'react'

// Per-device preferences, not household data, so they live in localStorage
// rather than IndexedDB (and are not in backups). Storage can be unavailable
// (private mode, blocked site data): reads then fall back to the defaults and
// the worst case is that a choice is not remembered.

export type ThemePref = 'system' | 'light' | 'dark'
export type WeekStart = 'monday' | 'sunday'
export type ExportFormat = 'text' | 'image' | 'print' | 'csv'
export type BookOrderPref = 'recent' | 'count' | 'title'
export type GoalPeriod = 'week' | 'month' | 'year'

// Readings to aim for per child in each week, month or year, counting re-reads.
export interface ReadingGoal {
  period: GoalPeriod | 'off'
  target: number
}

export interface ExportOptions {
  format: ExportFormat
  showCovers: boolean
  showNotes: boolean
  showCounts: boolean
}

interface Prefs {
  activeChildId: string
  bookOrder: BookOrderPref
  theme: ThemePref
  weekStart: WeekStart
  readingGoal: ReadingGoal
  // ISO timestamps; '' for never.
  lastBackupAt: string
  backupReminderSnoozedUntil: string
  exportOptions: ExportOptions
}

const DEFAULTS: Prefs = {
  activeChildId: '',
  bookOrder: 'recent',
  theme: 'system',
  weekStart: 'monday',
  readingGoal: { period: 'off', target: 10 },
  lastBackupAt: '',
  backupReminderSnoozedUntil: '',
  exportOptions: { format: 'text', showCovers: true, showNotes: true, showCounts: false },
}

const oneOf =
  <T extends string>(...values: T[]) =>
  (v: unknown): v is T =>
    values.includes(v as T)

const VALID: { [K in keyof Prefs]: (v: unknown) => boolean } = {
  activeChildId: (v) => typeof v === 'string',
  bookOrder: oneOf('recent', 'count', 'title'),
  theme: oneOf('system', 'light', 'dark'),
  weekStart: oneOf('monday', 'sunday'),
  readingGoal: (v) => {
    const g = v as ReadingGoal
    return (
      typeof g === 'object' && g !== null && oneOf('off', 'week', 'month', 'year')(g.period) && Number.isInteger(g.target) && g.target >= 1
    )
  },
  lastBackupAt: (v) => typeof v === 'string',
  backupReminderSnoozedUntil: (v) => typeof v === 'string',
  exportOptions: (v) => {
    const o = v as ExportOptions
    return (
      typeof o === 'object' &&
      o !== null &&
      oneOf('text', 'image', 'print', 'csv')(o.format) &&
      [o.showCovers, o.showNotes, o.showCounts].every((b) => typeof b === 'boolean')
    )
  },
}

export function readPref<K extends keyof Prefs>(key: K): Prefs[K] {
  let raw: string | null
  try {
    raw = localStorage.getItem(key)
  } catch {
    return DEFAULTS[key]
  }
  if (raw === null) return DEFAULTS[key]
  let value: unknown = raw
  try {
    value = JSON.parse(raw)
  } catch {
    // Stored as a bare string by earlier versions.
  }
  return VALID[key](value) ? (value as Prefs[K]) : DEFAULTS[key]
}

const listeners = new Set<() => void>()

// null forgets the preference, restoring the default.
export function writePref<K extends keyof Prefs>(key: K, value: Prefs[K] | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // not remembered; harmless
  }
  listeners.forEach((fn) => fn())
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  // Another tab changed a preference.
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

// Reads a preference and re-renders when it changes, in this tab or another.
export function usePref<K extends keyof Prefs>(key: K): [Prefs[K], (value: Prefs[K]) => void] {
  // Compared by its stored form, so object values don't re-render needlessly.
  const stored = useSyncExternalStore(subscribe, () => JSON.stringify(readPref(key)))
  return [JSON.parse(stored) as Prefs[K], (value) => writePref(key, value)]
}
