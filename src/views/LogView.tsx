import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Child, Edition, ReadingSession } from '../types'
import type { CoverLookup } from '../data/useLibrary'
import * as storage from '../data/storage'
import { searchCatalogue, lookupISBN, type BookSearchResult } from '../catalogue/catalogue'
import { pickPraise } from '../praise'
import { toISODate } from '../lib/dates'
import { errorMessage } from '../lib/errors'
import { BookCover } from '../components/BookCover'
import { StarRating } from '../components/StarRating'
import { Toast, useToast } from '../components/Toast'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { CoverCapture } from '../components/CoverCapture'

type EntryMode = 'none' | 'scan' | 'again' | 'search' | 'manual'

// Logs a reading for the active child: pick a book one of four ways, then date,
// rating and note.
export function LogView({
  activeChild,
  editions,
  sessions,
  coverFor,
  onChange,
  onChooseChild,
}: {
  activeChild: Child | undefined
  editions: Edition[]
  sessions: ReadingSession[]
  coverFor: CoverLookup
  onChange: () => void
  onChooseChild: () => void
}) {
  const [mode, setMode] = useState<EntryMode>('none')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BookSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<BookSearchResult | null>(null)
  const [manualTitle, setManualTitle] = useState('')
  const [manualAuthor, setManualAuthor] = useState('')
  const [manualIsbn, setManualIsbn] = useState('')
  const [date, setDate] = useState(() => toISODate(new Date()))
  const [note, setNote] = useState('')
  const [rating, setRating] = useState('')
  const [status, setStatus] = useState('')
  const [toast, showToast] = useToast(3300)
  const photo = useCoverPhoto()
  // So two readings logged back to back never get the same joke twice running.
  const lastPraiseTemplate = useRef<string>()

  // Every entry mode shares the date, rating and note fields below; note and
  // rating are cleared afterwards so they can't carry over onto the next book.
  const logReadingOf = async (edition: Edition, title: string) => {
    await storage.logReading({
      childId: activeChild!.id,
      editionId: edition.id,
      date,
      note: note.trim() || undefined,
      rating: rating ? Number(rating) : undefined,
    })
    setNote('')
    setRating('')
    const praise = pickPraise(title, lastPraiseTemplate.current)
    lastPraiseTemplate.current = praise.template
    showToast(praise.message)
    onChange()
  }

  // One tap logs the book, with no second step.
  const readAgain = async (edition: Edition) => {
    if (!activeChild) return
    try {
      await logReadingOf(edition, edition.title)
    } catch (err) {
      console.error('readAgain failed', err)
      setStatus(`Could not save: ${errorMessage(err)}`)
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

  const runSearch = async (e: FormEvent) => {
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

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!activeChild) return
    const book: BookSearchResult | null =
      selected ??
      (manualTitle.trim()
        ? { title: manualTitle.trim(), author: manualAuthor.trim() || 'Unknown', isbn: manualIsbn.trim() || undefined }
        : null)
    if (!book) return setStatus('Search and pick a book, or enter a title manually.')

    try {
      const edition = await storage.addEdition({
        title: book.title,
        author: book.author,
        coverUrl: book.coverUrl,
        isbn: book.isbn,
        source: selected ? 'openlibrary' : 'manual',
      })
      if (photo.blob) await storage.saveCoverPhoto(edition.id, photo.blob)
      await logReadingOf(edition, book.title)
      setSelected(null)
      setMode('none')
      setManualTitle('')
      setManualAuthor('')
      setManualIsbn('')
      photo.setBlob(null)
      setResults([])
      setQuery('')
      setStatus('')
    } catch (err) {
      console.error('logReading failed', err)
      setStatus(`Could not save: ${errorMessage(err)}`)
    }
  }

  if (!activeChild) {
    return (
      <div className="card empty-state">
        <span className="empty-icon" aria-hidden="true">📖</span>
        <p className="muted">No child selected yet.</p>
        <button className="submit-btn" onClick={onChooseChild}>Choose or add a child</button>
      </div>
    )
  }

  // The same capture affordance whether the book was picked or typed in.
  const coverPhotoControl = photo.capturing ? (
    <CoverCapture
      onCapture={(blob) => {
        photo.setBlob(blob)
        photo.setCapturing(false)
      }}
      onClose={() => photo.setCapturing(false)}
    />
  ) : (
    <button type="button" className="link-btn" onClick={() => photo.setCapturing(true)}>
      📷 {photo.blob ? 'Retake cover photo' : 'Add a cover photo'}
    </button>
  )

  const backButton = (
    <button type="button" className="back-btn" onClick={() => setMode('none')}>
      <span aria-hidden="true">←</span> Back
    </button>
  )

  return (
    <div>
      <form className="card" onSubmit={submit}>
        <p className="muted">
          New reading for <strong>{activeChild.name}</strong>
        </p>

        <div>
          <span className="field-label">Book</span>
          {selected ? (
            photo.capturing ? (
              coverPhotoControl
            ) : (
              <>
                <div className="search-result">
                  <BookCover src={photo.previewUrl ?? selected.coverUrl} title={selected.title} size="sm" />
                  <span>{selected.title} — {selected.author}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(null)
                      setMode('none')
                      photo.setBlob(null)
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
              {backButton}
              <ReadAgain childId={activeChild.id} editions={editions} sessions={sessions} coverFor={coverFor} onPick={readAgain} />
            </div>
          ) : mode === 'search' ? (
            <div>
              {backButton}
              <div className="search-row">
                <input placeholder="Search title or author" value={query} onChange={(e) => setQuery(e.target.value)} />
                <button type="button" className="btn-secondary" onClick={runSearch} disabled={searching}>
                  {searching ? 'Searching…' : 'Search'}
                </button>
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
              {backButton}
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
                {!photo.capturing && photo.previewUrl && (
                  <div className="search-result">
                    <BookCover src={photo.previewUrl} title={manualTitle || 'Cover photo'} size="sm" />
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

      <Toast message={toast} />
    </div>
  )
}

// This child's own books, most recently read first: not the whole household's,
// or one child's favourites would fill another's list of what to tap next.
function ReadAgain({
  childId,
  editions,
  sessions,
  coverFor,
  onPick,
}: {
  childId: string
  editions: Edition[]
  sessions: ReadingSession[]
  coverFor: CoverLookup
  onPick: (edition: Edition) => void
}) {
  const latestDateByEdition = new Map<string, string>()
  for (const s of sessions) {
    if (s.childId !== childId) continue
    const prev = latestDateByEdition.get(s.editionId)
    if (!prev || s.date > prev) latestDateByEdition.set(s.editionId, s.date)
  }
  const recent = Array.from(latestDateByEdition.entries())
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([editionId]) => editions.find((e) => e.id === editionId))
    .filter((e): e is Edition => !!e)

  if (recent.length === 0) return <p className="muted">No books to read again yet — try Search or Scan instead.</p>
  return (
    <>
      <p className="muted">Tap a book to log it, using the date and rating below.</p>
      <div className="cover-cascade">
        {recent.map((e) => (
          <button key={e.id} type="button" className="cascade-item" onClick={() => onPick(e)}>
            <BookCover src={coverFor(e)} title={e.title} size="lg" />
            <span>{e.title}</span>
          </button>
        ))}
      </div>
    </>
  )
}

// A just-taken cover photo, not yet saved, with an object URL for its preview.
function useCoverPhoto() {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  useEffect(() => {
    if (!blob) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return { blob, setBlob, previewUrl, capturing, setCapturing }
}
