import { useState } from 'react'
import type { Child, Edition, ReadingSession } from '../../types'
import type { CoverLookup } from '../../data/useLibrary'
import * as storage from '../../data/storage'
import { childTheme, DEFAULT_COLOUR } from '../../theme'
import { formatDateRangeLabel, formatDisplayDate, periodRange } from '../../lib/dates'
import { usePref, type WeekStart } from '../../lib/prefs'
import { BookCover } from '../../components/BookCover'
import { Panel } from '../../components/Panel'
import { Segmented } from '../../components/Segmented'
import { Toast, useToast } from '../../components/Toast'
import { ExportSheet } from './ExportSheet'
import { BookSheet } from './BookSheet'
import { EditReadingSheet } from './EditReadingSheet'
import { GoalCard } from './GoalCard'
import { BackupReminder } from './BackupReminder'
import './HistoryView.css'

type RangePreset = 'week' | 'month' | 'all' | 'custom'

const PRESETS: ReadonlyArray<readonly [RangePreset, string]> = [
  ['week', 'This week'],
  ['month', 'This month'],
  ['all', 'All time'],
  ['custom', 'Custom'],
]

function presetRange(preset: Exclude<RangePreset, 'custom'>, weekStart: WeekStart): [string, string] {
  return preset === 'all' ? ['', ''] : periodRange(preset, weekStart)
}

// The active child's readings over a chosen period, newest first, with export.
export function HistoryView({
  activeChild,
  children,
  editions,
  sessions,
  coverFor,
  hasCoverPhoto,
}: {
  activeChild: Child | undefined
  children: Child[]
  editions: Edition[]
  sessions: ReadingSession[]
  coverFor: CoverLookup
  hasCoverPhoto: (editionId: string) => boolean
}) {
  const [weekStart] = usePref('weekStart')
  const [preset, setPreset] = useState<RangePreset>('month')
  const [customFrom, setCustomFrom] = useState(() => presetRange('month', weekStart)[0])
  const [customTo, setCustomTo] = useState(() => presetRange('month', weekStart)[1])
  const [titleFilter, setTitleFilter] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [openBookId, setOpenBookId] = useState<string>()
  const [editingId, setEditingId] = useState<string>()
  // Lives here, not in the export sheet, so it survives the sheet closing
  // itself: a silent download needs something to say where it went.
  const [toast, showToast] = useToast(3000)

  if (sessions.length === 0) {
    return (
      <div className="card empty-state">
        <span className="empty-icon" aria-hidden="true">
          🕘
        </span>
        No readings logged yet.
      </div>
    )
  }

  const childById = new Map(children.map((c) => [c.id, c]))
  const editionById = new Map(editions.map((e) => [e.id, e]))
  const [from, to] = preset === 'custom' ? [customFrom, customTo] : presetRange(preset, weekStart)
  // With no active child (none added yet), the whole household.
  const childSessions = sessions.filter((s) => !activeChild || s.childId === activeChild.id)
  const query = titleFilter.trim().toLowerCase()
  // Newest first, as listSessions already orders them.
  const filtered = childSessions.filter(
    (s) =>
      !(from && s.date < from) &&
      !(to && s.date > to) &&
      (!query || (editionById.get(s.editionId)?.title.toLowerCase().includes(query) ?? false)),
  )
  const bookCount = new Set(filtered.map((s) => s.editionId)).size
  const editing = sessions.find((s) => s.id === editingId)

  return (
    <div>
      <BackupReminder readingCount={sessions.length} />
      {activeChild && <GoalCard child={activeChild} readings={childSessions} />}

      <div className="card history-filters">
        <span className="field-label" id="period-label">
          Period
        </span>
        <Segmented
          labelledBy="period-label"
          value={preset}
          options={PRESETS}
          onChange={(value) => {
            // Custom starts from whatever was showing, so it refines rather than resets.
            if (value === 'custom' && preset !== 'custom') {
              setCustomFrom(from)
              setCustomTo(to)
            }
            setPreset(value)
          }}
        />

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

        <input
          type="search"
          className="title-filter"
          placeholder="Filter by title"
          aria-label="Filter by title"
          value={titleFilter}
          onChange={(e) => setTitleFilter(e.target.value)}
        />

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
                <button
                  type="button"
                  className="session-row-cover"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={() => setOpenBookId(s.editionId)}
                >
                  <BookCover src={coverFor(edition)} title={title} size="sm" />
                </button>
                <div className="session-row-body">
                  <div className="session-row-header">
                    <div>
                      <button type="button" className="book-link" onClick={() => setOpenBookId(s.editionId)}>
                        {title}
                      </button>
                      {edition?.author && <span className="muted"> by {edition.author}</span>}
                    </div>
                    <span className="session-row-actions">
                      <button type="button" className="link-btn" onClick={() => setEditingId(s.id)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="link-btn danger"
                        onClick={() => {
                          if (confirm(`Remove this reading of "${title}"?`)) storage.deleteSession(s.id)
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  </div>
                  <div className="muted">
                    {formatDisplayDate(s.date)}
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

      <BookSheet
        edition={openBookId ? editionById.get(openBookId) : undefined}
        readings={childSessions.filter((s) => s.editionId === openBookId)}
        childName={activeChild?.name}
        coverFor={coverFor}
        hasCoverPhoto={openBookId ? hasCoverPhoto(openBookId) : false}
        onClose={() => setOpenBookId(undefined)}
      />
      <EditReadingSheet
        reading={editing}
        bookTitle={editing ? (editionById.get(editing.editionId)?.title ?? 'Unknown book') : ''}
        children={children}
        onClose={() => setEditingId(undefined)}
      />

      <Toast message={toast} />
    </div>
  )
}
