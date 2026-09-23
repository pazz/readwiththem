import { useEffect, useRef, useState } from 'react'
import type { Child, Edition, ReadingSession } from './types'
import * as storage from './storage'
import { searchCatalogue, lookupISBN, type BookSearchResult } from './catalogue'
import { BarcodeScanner } from './BarcodeScanner'
import { CoverCapture } from './CoverCapture'
import { renderPoster, type PosterTile } from './poster'

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

// A parent-photographed cover always wins over a catalogue one: it's their own
// copy, and it's the only option at all for a book the catalogue has no cover for.
function resolveCoverUrl(coverPhotoUrls: Map<string, string>, edition: Edition | undefined): string | undefined {
  if (!edition) return undefined
  return coverPhotoUrls.get(edition.id) ?? edition.coverUrl
}

function PosterCanvas({ tiles, label, showCounts }: { tiles: PosterTile[]; label: string; showCounts: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<'rendering' | 'ready' | 'error'>('rendering')
  const signature = `${label}::${showCounts}::${tiles.map((t) => `${t.coverUrl}~${t.count}`).join('|')}`

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    setStatus('rendering')
    renderPoster(canvas, tiles, label, { showCounts })
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
  const [coverPhotoUrls, setCoverPhotoUrls] = useState<Map<string, string>>(new Map())

  const reload = async () => {
    const [c, e, s, photos] = await Promise.all([
      storage.listChildren(),
      storage.listEditions(),
      storage.listSessions(),
      storage.listCoverPhotos(),
    ])
    setChildren(c)
    setEditions(e)
    setSessions(s)
    // Object URLs are per-blob handles into browser memory — replace the whole
    // set on reload rather than accumulating, or they'd leak for the session's
    // lifetime every time a new photo is added.
    setCoverPhotoUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url))
      return new Map(photos.map((p) => [p.editionId, URL.createObjectURL(p.blob)]))
    })
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          coverPhotoUrls={coverPhotoUrls}
          onChange={reload}
          onSwitchToChildren={() => setTab('children')}
        />
      )}
      {tab === 'history' && (
        <HistoryView
          sessions={sessions}
          children={children}
          editions={editions}
          coverPhotoUrls={coverPhotoUrls}
          onDelete={async (id) => {
            await storage.deleteSession(id)
            await reload()
          }}
        />
      )}
      {tab === 'export' && (
        <ExportView
          children={children}
          editions={editions}
          sessions={sessions}
          activeChildId={activeChildId}
          coverPhotoUrls={coverPhotoUrls}
        />
      )}
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
  coverPhotoUrls,
  onChange,
  onSwitchToChildren,
}: {
  activeChild: Child | undefined
  editions: Edition[]
  sessions: ReadingSession[]
  coverPhotoUrls: Map<string, string>
  onChange: () => void
  onSwitchToChildren: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BookSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<BookSearchResult | null>(null)
  const [mode, setMode] = useState<'none' | 'scan' | 'again' | 'search' | 'manual'>('none')
  const [manualTitle, setManualTitle] = useState('')
  const [manualAuthor, setManualAuthor] = useState('')
  const [manualIsbn, setManualIsbn] = useState('')
  const [date, setDate] = useState(() => toISODate(new Date()))
  const [note, setNote] = useState('')
  const [rating, setRating] = useState('')
  const [status, setStatus] = useState('')
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number>()
  const [coverPhotoBlob, setCoverPhotoBlob] = useState<Blob | null>(null)
  const [coverPhotoPreviewUrl, setCoverPhotoPreviewUrl] = useState<string | null>(null)
  const [capturingCover, setCapturingCover] = useState(false)

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  // The just-captured photo needs its own object URL for an immediate preview,
  // separate from coverPhotoUrls (which only covers already-saved editions).
  useEffect(() => {
    if (!coverPhotoBlob) {
      setCoverPhotoPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(coverPhotoBlob)
    setCoverPhotoPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [coverPhotoBlob])

  const confirm = (message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2200)
  }

  const latestDateByEdition = new Map<string, string>()
  for (const s of sessions) {
    const prev = latestDateByEdition.get(s.editionId)
    if (!prev || s.date > prev) latestDateByEdition.set(s.editionId, s.date)
  }
  const recentEditions = Array.from(latestDateByEdition.entries())
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([editionId]) => editions.find((e) => e.id === editionId))
    .filter((e): e is Edition => !!e)

  // One tap logs the book — no second step. It uses the same date/rating/note
  // fields shown below for every entry mode, rather than a separate set, and
  // clears the note and rating afterwards so they can't carry over onto the
  // next book tapped.
  const readAgain = async (edition: Edition) => {
    if (!activeChild) return
    try {
      await storage.logReading({
        childId: activeChild.id,
        editionId: edition.id,
        date,
        note: note.trim() || undefined,
        rating: rating ? Number(rating) : undefined,
      })
      setNote('')
      setRating('')
      confirm(`Logged ${edition.title}`)
      onChange()
    } catch (err) {
      console.error('readAgain failed', err)
      setStatus(`Could not save: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

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
      if (coverPhotoBlob) await storage.saveCoverPhoto(edition.id, coverPhotoBlob)
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
      setCoverPhotoBlob(null)
      setNote('')
      setRating('')
      setResults([])
      setQuery('')
      setStatus('')
      confirm(`Logged ${book.title}`)
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

  // Shared between the "picked a book" and "manual entry" branches below, so a
  // coverless book gets the same capture affordance regardless of how it was added.
  const coverPhotoControl = capturingCover ? (
    <CoverCapture
      onCapture={(blob) => {
        setCoverPhotoBlob(blob)
        setCapturingCover(false)
      }}
      onClose={() => setCapturingCover(false)}
    />
  ) : (
    <button type="button" className="link-btn" onClick={() => setCapturingCover(true)}>
      📷 {coverPhotoBlob ? 'Retake cover photo' : 'Add a cover photo'}
    </button>
  )

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
            capturingCover ? (
              coverPhotoControl
            ) : (
              <>
                <div className="search-result">
                  <BookCover src={coverPhotoPreviewUrl ?? selected.coverUrl} title={selected.title} size="sm" />
                  <span>{selected.title} — {selected.author}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(null)
                      setMode('none')
                      setCoverPhotoBlob(null)
                    }}
                  >
                    Change
                  </button>
                </div>
                {coverPhotoControl}
              </>
            )
          ) : mode === 'none' ? (
            <div className="book-entry-modes">
              <button type="button" className="mode-primary" onClick={() => setMode('again')}>
                <span aria-hidden="true">🔁</span> Read again
              </button>
              <button type="button" className="mode-primary" onClick={() => setMode('scan')}>
                <span aria-hidden="true">📖</span> Scan barcode
              </button>
              <button type="button" className="mode-primary" onClick={() => setMode('search')}>
                <span aria-hidden="true">🔍</span> Search
              </button>
              <button type="button" className="mode-primary" onClick={() => setMode('manual')}>
                <span aria-hidden="true">✏️</span> Add manually
              </button>
            </div>
          ) : mode === 'scan' ? (
            <BarcodeScanner onDetect={handleScanned} onClose={() => setMode('none')} />
          ) : mode === 'again' ? (
            <div>
              <button type="button" className="back-btn" onClick={() => setMode('none')}>
                <span aria-hidden="true">←</span> Back
              </button>
              {recentEditions.length > 0 ? (
                <>
                  <p className="muted">Tap a book to log it, using the date and rating below.</p>
                  <div className="cover-cascade">
                    {recentEditions.map((e) => (
                      <button key={e.id} type="button" className="cascade-item" onClick={() => readAgain(e)}>
                        <BookCover src={resolveCoverUrl(coverPhotoUrls, e)} title={e.title} size="lg" />
                        <span>{e.title}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="muted">No books to read again yet — try Search or Scan instead.</p>
              )}
            </div>
          ) : mode === 'search' ? (
            <div>
              <button type="button" className="back-btn" onClick={() => setMode('none')}>
                <span aria-hidden="true">←</span> Back
              </button>
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
              <button type="button" className="back-btn" onClick={() => setMode('none')}>
                <span aria-hidden="true">←</span> Back
              </button>
              <div className="manual-entry">
                <label>
                  <span className="field-label">Title</span>
                  <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} />
                </label>
                <label>
                  <span className="field-label">Author</span>
                  <input value={manualAuthor} onChange={(e) => setManualAuthor(e.target.value)} />
                </label>
                <label>
                  <span className="field-label">ISBN (optional)</span>
                  <input value={manualIsbn} onChange={(e) => setManualIsbn(e.target.value)} />
                </label>
                {!capturingCover && coverPhotoPreviewUrl && (
                  <div className="search-result">
                    <BookCover src={coverPhotoPreviewUrl} title={manualTitle || 'Cover photo'} size="sm" />
                    <span>Cover photo added</span>
                  </div>
                )}
                {coverPhotoControl}
              </div>
            </div>
          )}
        </div>

        <div className="field-row">
          <label>
            <span className="field-label">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div>
            <span className="field-label">Rating</span>
            <StarRating value={rating} onChange={setRating} />
          </div>
        </div>

        <textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

        <button className="submit-btn" type="submit">Log reading</button>
        {status && <p className="muted">{status}</p>}
      </form>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span> {toast}
        </div>
      )}
    </div>
  )
}

function HistoryView({
  sessions,
  children,
  editions,
  coverPhotoUrls,
  onDelete,
}: {
  sessions: ReadingSession[]
  children: Child[]
  editions: Edition[]
  coverPhotoUrls: Map<string, string>
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
            <BookCover src={resolveCoverUrl(coverPhotoUrls, edition)} title={title} size="sm" />
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
  coverPhotoUrls,
}: {
  children: Child[]
  editions: Edition[]
  sessions: ReadingSession[]
  activeChildId: string
  coverPhotoUrls: Map<string, string>
}) {
  // One selection drives every filtered export, rather than each output carrying
  // its own copy of the same child + date-range controls.
  const [filterChildId, setFilterChildId] = useState(activeChildId)
  const [from, setFrom] = useState(() => toISODate(startOfMonth(new Date())))
  const [to, setTo] = useState(() => toISODate(endOfMonth(new Date())))
  const [exportStyle, setExportStyle] = useState<'plain' | 'pretty' | 'poster'>('pretty')
  const [showCounts, setShowCounts] = useState(false)

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
          {([
            ['plain', 'Plain list'],
            ['pretty', 'Pretty list'],
            ['poster', 'Poster'],
          ] as const).map(([value, labelText]) => (
            <button
              key={value}
              type="button"
              aria-pressed={exportStyle === value}
              className={exportStyle === value ? 'active' : ''}
              onClick={() => setExportStyle(value)}
            >
              {labelText}
            </button>
          ))}
        </div>

        <label className="checkbox-row">
          <input type="checkbox" checked={showCounts} onChange={(e) => setShowCounts(e.target.checked)} />
          Include how often each book was read
        </label>

        {exportStyle !== 'poster' && (
          <>
            <button className="submit-btn print-btn" onClick={() => window.print()}>
              Print list / save as PDF
            </button>
            <p className="muted print-hint">Opens your device's print dialog — pick A4, or "Save as PDF" to keep a copy.</p>
          </>
        )}

        {exportStyle !== 'poster' ? (
          <div id="poster-print-area" className="print-page list-mode">
            <h2>{filterChild ? `${filterChild.name}'s books` : 'Our books'} — {rangeLabel}</h2>
            {books.length === 0 ? (
              <p className="muted">No readings logged for this selection yet.</p>
            ) : (
              <ul className={`export-list${exportStyle === 'plain' ? ' plain' : ''}`}>
                {books.map(({ editionId, count }) => {
                  const edition = editionById.get(editionId)
                  const title = edition?.title ?? 'Unknown book'
                  return (
                    <li key={editionId} className="export-list-row">
                      {exportStyle === 'pretty' && (
                        <span className="cover-with-count">
                          <BookCover src={resolveCoverUrl(coverPhotoUrls, edition)} title={title} size="sm" />
                          {showCounts && <span className="count-badge">×{count}</span>}
                        </span>
                      )}
                      <div className="export-list-text">
                        <strong>{title}</strong>
                        {edition?.author && <span className="muted"> — {edition.author}</span>}
                      </div>
                      {exportStyle === 'plain' && showCounts && <span className="count-inline">×{count}</span>}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : books.length === 0 ? (
          <p className="muted">No readings logged for this selection yet.</p>
        ) : (
          // One tile per distinct book, not per reading: re-reads would otherwise
          // repeat the same cover and shrink every tile for no extra information.
          <PosterCanvas
            tiles={books.map((b) => ({ coverUrl: resolveCoverUrl(coverPhotoUrls, editionById.get(b.editionId)), count: b.count }))}
            label={rangeLabel}
            showCounts={showCounts}
          />
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
