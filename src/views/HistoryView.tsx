import { useState } from 'react'
import type { Child, Edition, ReadingSession } from '../types'
import type { CoverLookup } from '../data/useLibrary'
import { childTheme, DEFAULT_COLOUR } from '../theme'
import { toISODate, startOfWeek, endOfWeek, startOfMonth, endOfMonth, formatDateRangeLabel } from '../lib/dates'
import { BookCover } from '../components/BookCover'
import { Panel } from '../components/Panel'
import { Toast, useToast } from '../components/Toast'
import { ExportSheet } from './ExportSheet'

type RangePreset = 'week' | 'month' | 'all' | 'custom'

const PRESETS: ReadonlyArray<[RangePreset, string]> = [
  ['week', 'This week'],
  ['month', 'This month'],
  ['all', 'All time'],
  ['custom', 'Custom'],
]

function presetRange(preset: Exclude<RangePreset, 'custom'>): [string, string] {
  const now = new Date()
  if (preset === 'week') return [toISODate(startOfWeek(now)), toISODate(endOfWeek(now))]
  if (preset === 'month') return [toISODate(startOfMonth(now)), toISODate(endOfMonth(now))]
  return ['', '']
}

// The active child's readings over a chosen period, newest first, with export.
export function HistoryView({
  activeChild,
  children,
  editions,
  sessions,
  coverFor,
  onDelete,
}: {
  activeChild: Child | undefined
  children: Child[]
  editions: Edition[]
  sessions: ReadingSession[]
  coverFor: CoverLookup
  onDelete: (id: string) => void
}) {
  const [preset, setPreset] = useState<RangePreset>('month')
  const [customFrom, setCustomFrom] = useState(() => presetRange('month')[0])
  const [customTo, setCustomTo] = useState(() => presetRange('month')[1])
  const [exportOpen, setExportOpen] = useState(false)
  // Lives here, not in the export sheet, so it survives the sheet closing
  // itself: a silent download needs something to say where it went.
  const [toast, showToast] = useToast(3000)

  if (sessions.length === 0) {
    return (
      <div className="card empty-state">
        <span className="empty-icon" aria-hidden="true">🕘</span>
        No readings logged yet.
      </div>
    )
  }

  const childById = new Map(children.map((c) => [c.id, c]))
  const editionById = new Map(editions.map((e) => [e.id, e]))
  const [from, to] = preset === 'custom' ? [customFrom, customTo] : presetRange(preset)
  // Newest first, as listSessions already orders them. With no active child
  // (none added yet), the whole household.
  const filtered = sessions.filter(
    (s) => (!activeChild || s.childId === activeChild.id) && !(from && s.date < from) && !(to && s.date > to),
  )
  const bookCount = new Set(filtered.map((s) => s.editionId)).size

  return (
    <div>
      <div className="card history-filters">
        <span className="field-label">Period</span>
        <div className="segmented">
          {PRESETS.map(([value, labelText]) => (
            <button
              key={value}
              type="button"
              aria-pressed={preset === value}
              className={preset === value ? 'active' : ''}
              onClick={() => {
                // Custom starts from whatever was showing, so it refines rather than resets.
                if (value === 'custom' && preset !== 'custom') {
                  setCustomFrom(from)
                  setCustomTo(to)
                }
                setPreset(value)
              }}
            >
              {labelText}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="filter-dates">
            <label>
              <span className="field-label">From</span>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label>
              <span className="field-label">To</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </div>
        )}

        <div className="history-summary">
          <span className="muted">
            {filtered.length} reading{filtered.length === 1 ? '' : 's'} · {bookCount} book{bookCount === 1 ? '' : 's'}
          </span>
          <button type="button" className="submit-btn export-btn" onClick={() => setExportOpen(true)} disabled={filtered.length === 0}>
            <span aria-hidden="true">↗</span> Export
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card empty-state">Nothing logged for this selection.</div>
      ) : (
        <div className="card">
          {filtered.map((s) => {
            const edition = editionById.get(s.editionId)
            const title = edition?.title ?? 'Unknown book'
            return (
              <div key={s.id} className="session-row">
                <BookCover src={coverFor(edition)} title={title} size="sm" />
                <div className="session-row-body">
                  <div className="session-row-header">
                    <div>
                      <strong>{title}</strong>
                      {edition?.author && <span className="muted"> by {edition.author}</span>}
                    </div>
                    <button
                      type="button"
                      className="link-btn danger"
                      onClick={() => {
                        if (confirm(`Remove this reading of "${title}"?`)) onDelete(s.id)
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="muted">
                    {s.date}
                    {!activeChild && ` · ${childById.get(s.childId)?.name ?? 'Unknown child'}`}
                    {s.rating ? ` · ${'★'.repeat(s.rating)}` : ''}
                  </div>
                  {s.note && <div>{s.note}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Panel open={exportOpen} onClose={() => setExportOpen(false)} variant="sheet" title="Export">
        <ExportSheet
          sessions={filtered}
          children={children}
          editions={editions}
          coverFor={coverFor}
          titleLine={activeChild ? `${activeChild.name}'s books` : 'Our books'}
          childName={activeChild?.name}
          accent={childTheme(activeChild?.colour ?? DEFAULT_COLOUR).light.primary}
          rangeLabel={formatDateRangeLabel(from, to)}
          onClose={() => setExportOpen(false)}
          onExported={showToast}
        />
      </Panel>

      <Toast message={toast} />
    </div>
  )
}
