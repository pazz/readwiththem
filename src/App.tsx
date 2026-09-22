import { useEffect, useState } from 'react'
import type { Child, Edition, ReadingSession } from './types'
import * as storage from './storage'
import { searchCatalogue, lookupISBN, type BookSearchResult } from './catalogue'
import { BarcodeScanner } from './BarcodeScanner'

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
        <button aria-current={tab === 'children'} onClick={() => setTab('children')}>Children</button>
        <button aria-current={tab === 'log'} onClick={() => setTab('log')}>Log a reading</button>
        <button aria-current={tab === 'history'} onClick={() => setTab('history')}>History</button>
        <button aria-current={tab === 'export'} onClick={() => setTab('export')}>Export</button>
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
        <LogReadingView activeChild={activeChild} editions={editions} onChange={reload} onSwitchToChildren={() => setTab('children')} />
      )}
      {tab === 'history' && <HistoryView sessions={sessions} children={children} editions={editions} />}
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
      <form onSubmit={submit}>
        <input placeholder="Child's name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Birth year (optional)" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} type="number" />
        <button className="submit-btn" type="submit">Add child</button>
        {error && <p className="muted">Could not save: {error}</p>}
      </form>
      {children.length === 0 && <p className="muted">Add a child above to get started.</p>}
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
  )
}

function LogReadingView({
  activeChild,
  editions,
  onChange,
  onSwitchToChildren,
}: {
  activeChild: Child | undefined
  editions: Edition[]
  onChange: () => void
  onSwitchToChildren: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BookSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<BookSearchResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualAuthor, setManualAuthor] = useState('')
  const [manualIsbn, setManualIsbn] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [rating, setRating] = useState('')
  const [status, setStatus] = useState('')

  const handleScanned = async (isbn: string) => {
    setScanning(false)
    setStatus('Looking up scanned ISBN…')
    try {
      const found = await lookupISBN(isbn)
      if (found) {
        setSelected(found)
        setStatus('')
        return
      }
      setStatus(`Scanned ISBN ${isbn} but couldn't find it online — fill in the title below.`)
    } catch {
      setStatus(`Scanned ISBN ${isbn}, but the lookup failed — check your connection, or fill in the title below.`)
    }
    setManualIsbn(isbn)
    setManualOpen(true)
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
      setManualTitle('')
      setManualAuthor('')
      setManualIsbn('')
      setManualOpen(false)
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
      <div>
        <p className="muted">No child selected yet.</p>
        <button className="submit-btn" onClick={onSwitchToChildren}>Choose or add a child</button>
      </div>
    )
  }

  return (
    <div>
      <form onSubmit={submit}>
        <p className="muted">
          Logging for <strong>{activeChild.name}</strong> ·{' '}
          <button type="button" className="link-btn" onClick={onSwitchToChildren}>switch child</button>
        </p>

        <div>
          Book
          {selected ? (
            <div className="search-result">
              <BookCover src={selected.coverUrl} title={selected.title} size="sm" />
              <span>{selected.title} — {selected.author}</span>
              <button type="button" onClick={() => setSelected(null)}>Change</button>
            </div>
          ) : scanning ? (
            <BarcodeScanner onDetect={handleScanned} onClose={() => setScanning(false)} />
          ) : (
            <>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input placeholder="Search title or author" value={query} onChange={(e) => setQuery(e.target.value)} />
                <button type="button" onClick={runSearch} disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
                <button type="button" onClick={() => setScanning(true)}>Scan barcode</button>
              </div>
              {results.map((r, i) => (
                <div key={i} className="search-result" onClick={() => setSelected(r)}>
                  <BookCover src={r.coverUrl} title={r.title} size="sm" />
                  <span>{r.title} — {r.author}</span>
                </div>
              ))}
              <details open={manualOpen} onToggle={(e) => setManualOpen(e.currentTarget.open)}>
                <summary>Can't find it — add manually</summary>
                <input placeholder="Title" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} />
                <input placeholder="Author" value={manualAuthor} onChange={(e) => setManualAuthor(e.target.value)} />
                <input placeholder="ISBN (optional)" value={manualIsbn} onChange={(e) => setManualIsbn(e.target.value)} />
              </details>
            </>
          )}
        </div>

        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <label>
          Rating (1–5, optional)
          <select value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>

        <textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

        <button className="submit-btn" type="submit">Log reading</button>
        {status && <p className="muted">{status}</p>}
      </form>
    </div>
  )
}

function HistoryView({ sessions, children, editions }: { sessions: ReadingSession[]; children: Child[]; editions: Edition[] }) {
  const childById = new Map(children.map((c) => [c.id, c]))
  const editionById = new Map(editions.map((e) => [e.id, e]))

  if (sessions.length === 0) return <p className="muted">No readings logged yet.</p>

  return (
    <div>
      {sessions.map((s) => {
        const edition = editionById.get(s.editionId)
        return (
          <div key={s.id} className="session-row">
            <strong>{edition?.title ?? 'Unknown book'}</strong>
            {edition?.author && <span className="muted"> by {edition.author}</span>}
            <div className="muted">
              {s.date} · {childById.get(s.childId)?.name ?? 'Unknown child'}
              {s.rating ? ` · ${'★'.repeat(s.rating)}` : ''}
            </div>
            {s.note && <div>{s.note}</div>}
          </div>
        )
      })}
    </div>
  )
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
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
  const [csvChildId, setCsvChildId] = useState('')
  const [csvFrom, setCsvFrom] = useState('')
  const [csvTo, setCsvTo] = useState('')
  const [posterChildId, setPosterChildId] = useState(activeChildId)
  const [posterMonth, setPosterMonth] = useState(() => new Date().toISOString().slice(0, 7))

  const editionById = new Map(editions.map((e) => [e.id, e]))

  const filteredForCSV = sessions.filter((s) => {
    if (csvChildId && s.childId !== csvChildId) return false
    if (csvFrom && s.date < csvFrom) return false
    if (csvTo && s.date > csvTo) return false
    return true
  })

  const posterChild = children.find((c) => c.id === posterChildId)
  const posterSessions = sessions
    .filter((s) => s.childId === posterChildId && s.date.startsWith(posterMonth))
    .sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div>
      <p className="muted">Export is your backup — this prototype keeps data only in this browser.</p>
      <button onClick={async () => download('readwiththem-backup.json', await storage.exportBackupJSON(), 'application/json')}>
        Download full JSON backup
      </button>

      <h3>Reading history CSV</h3>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        <select value={csvChildId} onChange={(e) => setCsvChildId(e.target.value)}>
          <option value="">All children</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input type="date" value={csvFrom} onChange={(e) => setCsvFrom(e.target.value)} aria-label="From date" />
        <input type="date" value={csvTo} onChange={(e) => setCsvTo(e.target.value)} aria-label="To date" />
      </div>
      <button onClick={() => download('readwiththem-sessions.csv', storage.sessionsToCSV(filteredForCSV, children, editions), 'text/csv')}>
        Download CSV ({filteredForCSV.length} reading{filteredForCSV.length === 1 ? '' : 's'})
      </button>

      <h3>Monthly poster</h3>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        <select value={posterChildId} onChange={(e) => setPosterChildId(e.target.value)}>
          <option value="">Select child</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input type="month" value={posterMonth} onChange={(e) => setPosterMonth(e.target.value)} />
      </div>

      {posterChild && (
        <>
          <button onClick={() => window.print()}>Print poster / save as PDF</button>
          <div id="poster-print-area" className="poster">
            <h2>{posterChild.name}'s books — {formatMonth(posterMonth)}</h2>
            {posterSessions.length === 0 ? (
              <p className="muted">No readings logged for this month yet.</p>
            ) : (
              <div className="poster-grid">
                {posterSessions.map((s) => {
                  const edition = editionById.get(s.editionId)
                  const title = edition?.title ?? 'Unknown book'
                  return (
                    <div key={s.id} className="poster-item">
                      <BookCover src={edition?.coverUrl} title={title} size="lg" />
                      <span>{title}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
