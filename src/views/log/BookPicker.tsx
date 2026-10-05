import { LanguageBadge } from '../../components/LanguageBadge'
import { COMMON_LANGUAGES, languageFromISBN, languageName } from '../../catalogue/language'
import type { Dispatch, ReactNode } from 'react'
import type { Edition, ReadingSession } from '../../types'
import type { CoverLookup } from '../../data/useLibrary'
import { searchCatalogue, lookupISBN } from '../../catalogue/catalogue'
import { BookCover } from '../../components/BookCover'
import { BarcodeScanner } from '../../components/BarcodeScanner'
import type { LogForm, LogFormAction } from './logForm'

// The "Book" part of the log form: pick a book one of four ways, or show the
// one picked. `coverControl` is the cover-photo affordance, shared with the
// manual entry.
export function BookPicker({
  form,
  dispatch,
  childId,
  editions,
  sessions,
  coverFor,
  coverPreview,
  capturingCover,
  coverControl,
  onDeselect,
  onReadAgain,
}: {
  form: LogForm
  dispatch: Dispatch<LogFormAction>
  childId: string
  editions: Edition[]
  sessions: ReadingSession[]
  coverFor: CoverLookup
  coverPreview: string | undefined
  capturingCover: boolean
  coverControl: ReactNode
  onDeselect: () => void
  onReadAgain: (edition: Edition) => void
}) {
  const { mode, selected, manual } = form

  const handleScanned = async (isbn: string) => {
    dispatch({ type: 'status', status: 'Looking up scanned ISBN…' })
    try {
      const found = await lookupISBN(isbn)
      if (found) return dispatch({ type: 'select', book: found })
      dispatch({ type: 'scanMissed', isbn, status: `Scanned ISBN ${isbn} but couldn't find it online — fill in the title below.` })
    } catch {
      dispatch({
        type: 'scanMissed',
        isbn,
        status: `Scanned ISBN ${isbn}, but the lookup failed — check your connection, or fill in the title below.`,
      })
    }
  }

  const runSearch = async () => {
    const query = form.query.trim()
    if (!query) return
    dispatch({ type: 'searchStarted' })
    try {
      const householdMatches = editions.filter((ed) => ed.title.toLowerCase().includes(form.query.toLowerCase()))
      const online = await searchCatalogue(form.query)
      const results = [
        ...householdMatches.map((ed) => ({
          title: ed.title,
          author: ed.author,
          isbn: ed.isbn,
          language: ed.language,
          coverUrl: ed.coverUrl,
          source: ed.source,
        })),
        ...online,
      ]
      dispatch({ type: 'searchFinished', results })
    } catch {
      dispatch({ type: 'searchFinished', status: 'Search failed — check your connection, or add the book manually below.' })
    }
  }

  const backButton = (
    <button type="button" className="back-btn" onClick={() => dispatch({ type: 'mode', mode: 'none' })}>
      <span aria-hidden="true">←</span> Back
    </button>
  )

  if (selected) {
    if (capturingCover) return coverControl
    return (
      <>
        <div className="search-result">
          <BookCover src={coverPreview ?? selected.coverUrl} title={selected.title} size="sm" />
          <span>
            {selected.title} — {selected.author}
            <LanguageBadge code={selected.language} />
          </span>
          <button type="button" onClick={onDeselect}>
            Change
          </button>
        </div>
        {coverControl}
      </>
    )
  }

  switch (mode) {
    case 'none':
      return (
        <div className="book-entry-modes">
          <button type="button" className="mode-primary" onClick={() => dispatch({ type: 'mode', mode: 'again' })}>
            <span aria-hidden="true">🔁</span> Read again
          </button>
          <button type="button" className="mode-primary" onClick={() => dispatch({ type: 'mode', mode: 'scan' })}>
            <span aria-hidden="true">📖</span> Scan barcode
          </button>
          <button type="button" className="mode-primary" onClick={() => dispatch({ type: 'mode', mode: 'search' })}>
            <span aria-hidden="true">🔍</span> Search
          </button>
          <button type="button" className="mode-primary" onClick={() => dispatch({ type: 'mode', mode: 'manual' })}>
            <span aria-hidden="true">✏️</span> Add manually
          </button>
        </div>
      )
    case 'scan':
      return <BarcodeScanner onDetect={handleScanned} onClose={() => dispatch({ type: 'mode', mode: 'none' })} />
    case 'again':
      return (
        <div>
          {backButton}
          <ReadAgain childId={childId} editions={editions} sessions={sessions} coverFor={coverFor} onPick={onReadAgain} />
        </div>
      )
    case 'search':
      return (
        <div>
          {backButton}
          <div className="search-row">
            <input
              placeholder="Search title or author"
              value={form.query}
              onChange={(e) => dispatch({ type: 'query', query: e.target.value })}
            />
            <button type="button" className="btn-secondary" onClick={runSearch} disabled={form.searching}>
              {form.searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          {form.results.map((r, i) => (
            <button key={i} type="button" className="search-result" onClick={() => dispatch({ type: 'select', book: r })}>
              <BookCover src={r.coverUrl} title={r.title} size="sm" />
              <span>
                {r.title} — {r.author}
                <LanguageBadge code={r.language} />
              </span>
            </button>
          ))}
        </div>
      )
    case 'manual': {
      const fromISBN = languageFromISBN(manual.isbn)
      return (
        <div>
          {backButton}
          <div className="manual-entry">
            <label>
              <span className="field-label">Title</span>
              <input value={manual.title} onChange={(e) => dispatch({ type: 'manual', field: 'title', value: e.target.value })} />
            </label>
            <label>
              <span className="field-label">Author</span>
              <input value={manual.author} onChange={(e) => dispatch({ type: 'manual', field: 'author', value: e.target.value })} />
            </label>
            <label>
              <span className="field-label">ISBN (optional)</span>
              <input value={manual.isbn} onChange={(e) => dispatch({ type: 'manual', field: 'isbn', value: e.target.value })} />
            </label>
            <label>
              <span className="field-label">Language (optional)</span>
              <select value={manual.language} onChange={(e) => dispatch({ type: 'manual', field: 'language', value: e.target.value })}>
                <option value="">{fromISBN ? `From the ISBN (${languageName(fromISBN)})` : 'Not set'}</option>
                {COMMON_LANGUAGES.map((code) => (
                  <option key={code} value={code}>
                    {languageName(code)}
                  </option>
                ))}
              </select>
            </label>
            {!capturingCover && coverPreview && (
              <div className="search-result">
                <BookCover src={coverPreview} title={manual.title || 'Cover photo'} size="sm" />
                <span>Cover photo added</span>
              </div>
            )}
            {coverControl}
          </div>
        </div>
      )
    }
  }
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
            <span>
              {e.title}
              <LanguageBadge code={e.language} />
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
