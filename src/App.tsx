import { useEffect, useRef, useState } from 'react'
import type { Child, Edition, ReadingSession } from './types'
import * as storage from './storage'
import { searchCatalogue, lookupISBN, type BookSearchResult } from './catalogue'
import { BarcodeScanner } from './BarcodeScanner'
import { renderPoster } from './poster'

function BookCover({ src, title, size }: { src: string | undefined; title: string; size: 'sm' | 'lg' }) {
  const [failed, setFailed] = useState(false)
  const sizeClass = size === 'sm' ? 'cover-sm' : 'cover-lg'
  if (!src || failed) {
    return (
      <div className={`cover-placeholder ${sizeClass}`} role="img" aria-label={title}>
        {title}
      </div>
    )
  }
  return <img src={src} alt={title} className={sizeClass} onError={() => setFailed(true)} />
}

function PosterCanvas({ coverUrls, label }: { coverUrls: Array<string | undefined>; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<'rendering' | 'ready' | 'error'>('rendering')
  const signature = `${label}::${coverUrls.join('|')}`

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    setStatus('rendering')
    renderPoster(canvas, coverUrls, label)
      .then(() => !cancelled && setStatus('ready'))
      .catch((err) => {
        console.error('poster render failed', err)
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  const downloadImage = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      canvas.toBlob((blob) => {
        if (blob) download('readwiththem-poster.png', blob, 'image/png')
      }, 'image/png')
    } catch (err) {
      console.error('poster download failed', err)
      setStatus('error')
    }
  }

  return (
    <>
      <button className="submit-btn print-btn" onClick={downloadImage} disabled={status !== 'ready'}>
        {status === 'rendering' ? 'Preparing poster…' : 'Download poster (PNG)'}
      </button>
      <button className="btn-secondary print-btn secondary-print" onClick={() => window.print()}>
        Print / save as PDF
      </button>
      <p className="muted print-hint">
        {status === 'error'
          ? 'The poster could not be generated — some covers may be unavailable.'
          : 'Always exactly one A4 page. Save the image to share it, or print it straight from your gallery.'}
      </p>
      <div id="poster-print-area" className="print-page poster-mode">
        <canvas ref={canvasRef} className="poster-canvas" />
      </div>
    </>
  )
}

function StarRating({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const current = Number(value) || 0
  return (
    <div className="star-rating" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={current === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          className={`star${n <= current ? ' filled' : ''}`}
          onClick={() => onChange(current === n ? '' : String(n))}
        >
          ★
        </button>
      ))}
    </div>
  )
}

type Tab = 'children' | 'log' | 'history' | 'export'

// Which child is active is a per-device UI convenience, not household data, so it
// lives in localStorage rather than IndexedDB.
function loadActiveChildId(): string {
  try {
    return localStorage.getItem('activeChildId') ?? ''
  } catch {
    return ''
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>(() => (loadActiveChildId() ? 'log' : 'children'))
  const [children, setChildren] = useState<Child[]>([])
  const [editions, setEditions] = useState<Edition[]>([])
  const [sessions, setSessions] = useState<ReadingSession[]>([])
  const [activeChildId, setActiveChildId] = useState(loadActiveChildId)

  const reload = async () => {
    const [c, e, s] = await Promise.all([storage.listChildren(), storage.listEditions(), storage.listSessions()])
    setChildren(c)
    setEditions(e)
    setSessions(s)
  }

  useEffect(() => {
    reload()
  }, [])

  const chooseChild = (id: string) => {
    setActiveChildId(id)
    try {
      localStorage.setItem('activeChildId', id)
    } catch {
      // ignore — worst case the choice just isn't remembered next session
    }
    setTab('log')
  }

  const activeChild = children.find((c) => c.id === activeChildId)

  return (
    <div className="app">
      <h1>Read With Them</h1>
      <nav>
        <button aria-current={tab === 'children'} onClick={() => setTab('children')}>
          <span className="nav-icon" aria-hidden="true">👶</span>
          Children
        </button>
        <button aria-current={tab === 'log'} onClick={() => setTab('log')}>
          <span className="nav-icon" aria-hidden="true">📖</span>
          Log
        </button>
        <button aria-current={tab === 'history'} onClick={() => setTab('history')}>
          <span className="nav-icon" aria-hidden="true">🕘</span>
          History
        </button>
        <button aria-current={tab === 'export'} onClick={() => setTab('export')}>
          <span className="nav-icon" aria-hidden="true">📤</span>
          Export
        </button>
      </nav>

      {tab === 'children' && (
        <ChildrenView
          children={children}
          activeChildId={activeChildId}
          onSelect={chooseChild}
          onCreated={async (id) => {
            await reload()
            chooseChild(id)
          }}
        />
      )}
      {tab === 'log' && (
        <LogReadingView
          activeChild={activeChild}
          editions={editions}
          sessions={sessions}
          onChange={reload}
          onSwitchToChildren={() => setTab('children')}
        />
      )}
      {tab === 'history' && (
        <HistoryView
          sessions={sessions}
          children={children}
          editions={editions}
          onDelete={async (id) => {
            await storage.deleteSession(id)
            await reload()
          }}
        />
      )}
      {tab === 'export' && <ExportView children={children} editions={editions} sessions={sessions} activeChildId={activeChildId} />}
    </div>
  )
}

function ChildrenView({
  children,
  activeChildId,
  onSelect,
  onCreated,
}: {
  children: Child[]
  activeChildId: string
  onSelect: (id: string) => void
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      const child = await storage.addChild(name.trim(), birthYear ? Number(birthYear) : undefined)
      setName('')
      setBirthYear('')
      setError('')
      onCreated(child.id)
    } catch (err) {
      console.error('addChild failed', err)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div>
      <div className="card">
        <form onSubmit={submit}>
          <input placeholder="Child's name" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Birth year (optional)" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} type="number" />
          <button className="submit-btn" type="submit">Add child</button>
          {error && <p className="muted">Could not save: {error}</p>}
        </form>
      </div>

      {children.length === 0 ? (
        <div className="card empty-state">
          <span className="empty-icon" aria-hidden="true">🧒</span>
          Add a child above to get started.
        </div>
      ) : (
        <div className="card">
          <ul className="child-list">
            {children.map((c) => (
              <li key={c.id}>
                <button type="button" className={c.id === activeChildId ? 'child-active' : ''} onClick={() => onSelect(c.id)}>
                  {c.id === activeChildId ? '✓ ' : ''}
                  {c.name}
                  {c.birthYear ? ` (b. ${c.birthYear})` : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function LogReadingView({
  activeChild,
  editions,
  sessions,
  onChange,
  onSwitchToChildren,
}: {
  activeChild: Child | undefined
  editions: Edition[]
  sessions: ReadingSession[]
  onChange: () => void
  onSwitchToChildren: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BookSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<BookSearchResult | null>(null)
  const [mode, setMode] = useState<'none' | 'scan' | 'recents' | 'search' | 'manual'>('none')
  const [manualTitle, setManualTitle] = useState('')
  const [manualAuthor, setManualAuthor] = useState('')
  const [manualIsbn, setManualIsbn] = useState('')
  const [date, setDate] = useState(() => toISODate(new Date()))
  const [note, setNote] = useState('')
  const [rating, setRating] = useState('')
  const [status, setStatus] = useState('')

  const latestDateByEdition = new Map<string, string>()
  for (const s of sessions) {
    const prev = latestDateByEdition.get(s.editionId)
    if (!prev || s.date > prev) latestDateByEdition.set(s.editionId, s.date)
  }
  const recentEditions = Array.from(latestDateByEdition.entries())
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, 8)
    .map(([editionId]) => editions.find((e) => e.id === editionId))
    .filter((e): e is Edition => !!e)

  const handleScanned = async (isbn: string) => {
    setStatus('Looking up scanned ISBN…')
    try {
      const found = await lookupISBN(isbn)
      if (found) {
        setSelected(found)
        setMode('none')
        setStatus('')
        return
      }
      setStatus(`Scanned ISBN ${isbn} but couldn't find it online — fill in the title below.`)
    } catch {
      setStatus(`Scanned ISBN ${isbn}, but the lookup failed — check your connection, or fill in the title below.`)
    }
    setManualIsbn(isbn)
    setMode('manual')
  }

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    try {
      const householdMatches = editions.filter((ed) => ed.title.toLowerCase().includes(query.toLowerCase()))
      const online = await searchCatalogue(query)
      setResults([...householdMatches.map((ed) => ({ title: ed.title, author: ed.author, isbn: ed.isbn, coverUrl: ed.coverUrl })), ...online])
    } catch {
      setStatus('Search failed — check your connection, or add the book manually below.')
    } finally {
      setSearching(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeChild) return
    const book =
      selected ??
      (manualTitle.trim()
        ? { title: manualTitle.trim(), author: manualAuthor.trim() || 'Unknown', isbn: manualIsbn.trim() || undefined }
        : null)
    if (!book) return setStatus('Search and pick a book, or enter a title manually.')

    try {
      const edition = await storage.addEdition({
        title: book.title,
        author: book.author,
        coverUrl: 'coverUrl' in book ? book.coverUrl : undefined,
        isbn: 'isbn' in book ? book.isbn : undefined,
        source: selected ? 'openlibrary' : 'manual',
      })
      await storage.logReading({
        childId: activeChild.id,
        editionId: edition.id,
        date,
        note: note.trim() || undefined,
        rating: rating ? Number(rating) : undefined,
      })

      setSelected(null)
      setMode('none')
      setManualTitle('')
      setManualAuthor('')
      setManualIsbn('')
      setNote('')
      setRating('')
      setResults([])
      setQuery('')
      setStatus('Logged.')
      onChange()
    } catch (err) {
      console.error('logReading failed', err)
      setStatus(`Could not save: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (!activeChild) {
    return (
      <div className="card empty-state">
        <span className="empty-icon" aria-hidden="true">📖</span>
        <p className="muted">No child selected yet.</p>
        <button className="submit-btn" onClick={onSwitchToChildren}>Choose or add a child</button>
      </div>
    )
  }

  return (
    <div>
      <form className="card" onSubmit={submit}>
        <p className="muted">
          Logging for <strong>{activeChild.name}</strong> ·{' '}
          <button type="button" className="link-btn" onClick={onSwitchToChildren}>switch child</button>
        </p>

        <div>
          <span className="field-label">Book</span>
          {selected ? (
            <div className="search-result">
              <BookCover src={selected.coverUrl} title={selected.title} size="sm" />
              <span>{selected.title} — {selected.author}</span>
              <button
                type="button"
                onClick={() => {
                  setSelected(null)
                  setMode('none')
                }}
              >
                Change
              </button>
            </div>
          ) : mode === 'none' ? (
            <div className="book-entry-modes">
              <div className="mode-primary-row">
                <button type="button" className="mode-primary" onClick={() => setMode('recents')}>
                  <span aria-hidden="true">🔁</span> Recents
                </button>
                <button type="button" className="mode-primary" onClick={() => setMode('scan')}>
                  <span aria-hidden="true">📖</span> Scan barcode
                </button>
              </div>
              <div className="mode-secondary-row">
                <button type="button" onClick={() => setMode('manual')}>Add manually</button>
                <button type="button" onClick={() => setMode('search')}>Search</button>
              </div>
            </div>
          ) : mode === 'scan' ? (
            <BarcodeScanner onDetect={handleScanned} onClose={() => setMode('none')} />
          ) : mode === 'recents' ? (
            <div>
              <button type="button" className="link-btn" onClick={() => setMode('none')}>‹ back</button>
              {recentEditions.length > 0 ? (
                <div className="recent-books-row">
                  {recentEditions.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="recent-book"
                      onClick={() => setSelected({ title: e.title, author: e.author, isbn: e.isbn, coverUrl: e.coverUrl })}
                    >
                      <BookCover src={e.coverUrl} title={e.title} size="sm" />
                      <span>{e.title}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">No recently read books yet — try Search or Scan instead.</p>
              )}
            </div>
          ) : mode === 'search' ? (
            <div>
              <button type="button" className="link-btn" onClick={() => setMode('none')}>‹ back</button>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input placeholder="Search title or author" value={query} onChange={(e) => setQuery(e.target.value)} />
                <button type="button" onClick={runSearch} disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
              </div>
              {results.map((r, i) => (
                <div key={i} className="search-result" onClick={() => setSelected(r)}>
                  <BookCover src={r.coverUrl} title={r.title} size="sm" />
                  <span>{r.title} — {r.author}</span>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <button type="button" className="link-btn" onClick={() => setMode('none')}>‹ back</button>
              <input placeholder="Title" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} />
              <input placeholder="Author" value={manualAuthor} onChange={(e) => setManualAuthor(e.target.value)} />
              <input placeholder="ISBN (optional)" value={manualIsbn} onChange={(e) => setManualIsbn(e.target.value)} />
            </div>
          )}
        </div>

        <label>
          <span className="field-label">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div>
          <span className="field-label">Rating (optional)</span>
          <StarRating value={rating} onChange={setRating} />
        </div>

        <textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

        <button className="submit-btn" type="submit">Log reading</button>
        {status && <p className="muted">{status}</p>}
      </form>
    </div>
  )
}

function HistoryView({
  sessions,
  children,
  editions,
  onDelete,
}: {
  sessions: ReadingSession[]
  children: Child[]
  editions: Edition[]
  onDelete: (id: string) => void
}) {
  const childById = new Map(children.map((c) => [c.id, c]))
  const editionById = new Map(editions.map((e) => [e.id, e]))

  if (sessions.length === 0) {
    return (
      <div className="card empty-state">
        <span className="empty-icon" aria-hidden="true">🕘</span>
        No readings logged yet.
      </div>
    )
  }

  return (
    <div className="card">
      {sessions.map((s) => {
        const edition = editionById.get(s.editionId)
        const title = edition?.title ?? 'Unknown book'
        return (
          <div key={s.id} className="session-row">
            <BookCover src={edition?.coverUrl} title={title} size="sm" />
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
                {s.date} · {childById.get(s.childId)?.name ?? 'Unknown child'}
                {s.rating ? ` · ${'★'.repeat(s.rating)}` : ''}
              </div>
              {s.note && <div>{s.note}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function download(filename: string, content: string | Blob, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Deliberately not d.toISOString().slice(0, 10): that converts to UTC first, which
// silently shifts the date by a day whenever the local timezone offset crosses
// midnight relative to UTC — exactly the kind of bug that only shows up sometimes.
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function startOfWeek(d: Date): Date {
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return monday
}

function endOfWeek(d: Date): Date {
  const sunday = startOfWeek(d)
  sunday.setDate(sunday.getDate() + 6)
  return sunday
}

// An empty bound means unbounded, so the same range powers "this month" and "all time".
function formatDateRangeLabel(from: string, to: string): string {
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

function ExportView({
  children,
  editions,
  sessions,
  activeChildId,
}: {
  children: Child[]
  editions: Edition[]
  sessions: ReadingSession[]
  activeChildId: string
}) {
  // One selection drives every filtered export, rather than each output carrying
  // its own copy of the same child + date-range controls.
  const [filterChildId, setFilterChildId] = useState(activeChildId)
  const [from, setFrom] = useState(() => toISODate(startOfMonth(new Date())))
  const [to, setTo] = useState(() => toISODate(endOfMonth(new Date())))
  const [exportStyle, setExportStyle] = useState<'list' | 'poster'>('list')

  const editionById = new Map(editions.map((e) => [e.id, e]))

  const filtered = sessions
    .filter((s) => {
      if (filterChildId && s.childId !== filterChildId) return false
      if (from && s.date < from) return false
      if (to && s.date > to) return false
      return true
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  const filterChild = children.find((c) => c.id === filterChildId)
  const rangeLabel = formatDateRangeLabel(from, to)

  // One entry per book, not per reading — a re-read shows a "×N" badge instead of repeating the cover.
  const books: Array<{ editionId: string; count: number }> = []
  const bookIndex = new Map<string, number>()
  for (const s of filtered) {
    const existingIndex = bookIndex.get(s.editionId)
    if (existingIndex === undefined) {
      bookIndex.set(s.editionId, books.length)
      books.push({ editionId: s.editionId, count: 1 })
    } else {
      books[existingIndex].count += 1
    }
  }

  return (
    <div>
      <div className="card">
        <h3>What to export</h3>
        <label className="filter-field">
          <span className="field-label">Child</span>
          <select value={filterChildId} onChange={(e) => setFilterChildId(e.target.value)}>
            <option value="">All children</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <div className="filter-dates">
          <label>
            <span className="field-label">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            <span className="field-label">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        <div className="preset-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setFrom(toISODate(startOfWeek(new Date())))
              setTo(toISODate(endOfWeek(new Date())))
            }}
          >
            This week
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setFrom(toISODate(startOfMonth(new Date())))
              setTo(toISODate(endOfMonth(new Date())))
            }}
          >
            This month
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setFrom('')
              setTo('')
            }}
          >
            All time
          </button>
        </div>

        <p className="muted export-summary">
          {filtered.length} reading{filtered.length === 1 ? '' : 's'} · {books.length} book{books.length === 1 ? '' : 's'} · {rangeLabel}
        </p>
      </div>

      <div className="card">
        <h3>Print</h3>
        <div className="segmented">
          <button
            type="button"
            aria-pressed={exportStyle === 'list'}
            className={exportStyle === 'list' ? 'active' : ''}
            onClick={() => setExportStyle('list')}
          >
            Pretty list
          </button>
          <button
            type="button"
            aria-pressed={exportStyle === 'poster'}
            className={exportStyle === 'poster' ? 'active' : ''}
            onClick={() => setExportStyle('poster')}
          >
            Poster
          </button>
        </div>

        {exportStyle === 'list' && (
          <>
            <button className="submit-btn print-btn" onClick={() => window.print()}>
              Print list / save as PDF
            </button>
            <p className="muted print-hint">Opens your device's print dialog — pick A4, or "Save as PDF" to keep a copy.</p>
          </>
        )}

        {exportStyle === 'list' ? (
          <div id="poster-print-area" className="print-page list-mode">
            <h2>{filterChild ? `${filterChild.name}'s books` : 'Our books'} — {rangeLabel}</h2>
            {books.length === 0 ? (
              <p className="muted">No readings logged for this selection yet.</p>
            ) : (
              <ul className="export-list">
                {books.map(({ editionId, count }) => {
                  const edition = editionById.get(editionId)
                  const title = edition?.title ?? 'Unknown book'
                  return (
                    <li key={editionId} className="export-list-row">
                      <BookCover src={edition?.coverUrl} title={title} size="sm" />
                      <div className="export-list-text">
                        <strong>{title}</strong>
                        {edition?.author && <span className="muted"> — {edition.author}</span>}
                      </div>
                      {count > 1 && <span className="muted">×{count}</span>}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <p className="muted">No readings logged for this selection yet.</p>
        ) : (
          <PosterCanvas coverUrls={filtered.map((s) => editionById.get(s.editionId)?.coverUrl)} label={rangeLabel} />
        )}
      </div>

      <div className="card">
        <h3>Download</h3>
        <div className="download-row">
          <button className="btn-secondary" onClick={() => download('readwiththem-sessions.csv', storage.sessionsToCSV(filtered, children, editions), 'text/csv')}>
            CSV ({filtered.length} reading{filtered.length === 1 ? '' : 's'})
          </button>
          <span className="muted">One row per reading, for the selection above.</span>
        </div>
        <div className="download-row">
          <button className="btn-secondary" onClick={async () => download('readwiththem-backup.json', await storage.exportBackupJSON(), 'application/json')}>
            Full JSON backup
          </button>
          <span className="muted">Everything in this browser, ignoring the selection above. This is your backup — the data lives nowhere else.</span>
        </div>
      </div>
    </div>
  )
}
