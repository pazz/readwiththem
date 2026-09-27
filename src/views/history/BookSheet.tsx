import { useState, type FormEvent } from 'react'
import type { Edition, ReadingSession } from '../../types'
import type { CoverLookup } from '../../data/useLibrary'
import * as storage from '../../data/storage'
import { formatDisplayDate } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { Panel } from '../../components/Panel'
import { BookCover } from '../../components/BookCover'
import { CoverCapture } from '../../components/CoverCapture'

// One book: how often and when it was read, every note, and ways to correct
// its title and author or give it a cover photo.
export function BookSheet({
  edition,
  readings,
  childName,
  coverFor,
  hasCoverPhoto,
  onClose,
}: {
  edition: Edition | undefined
  readings: ReadingSession[]
  childName: string | undefined
  coverFor: CoverLookup
  hasCoverPhoto: boolean
  onClose: () => void
}) {
  return (
    <Panel open={!!edition} onClose={onClose} variant="sheet" title={edition?.title ?? 'Book'}>
      {edition && (
        <BookDetails
          key={edition.id}
          edition={edition}
          readings={readings}
          childName={childName}
          coverFor={coverFor}
          hasCoverPhoto={hasCoverPhoto}
        />
      )}
    </Panel>
  )
}

function BookDetails({
  edition,
  readings,
  childName,
  coverFor,
  hasCoverPhoto,
}: {
  edition: Edition
  readings: ReadingSession[]
  childName: string | undefined
  coverFor: CoverLookup
  hasCoverPhoto: boolean
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'photo'>('view')
  // Readings arrive newest first.
  const first = readings.at(-1)
  const last = readings[0]
  const notes = readings.filter((r) => r.note)

  if (mode === 'photo') {
    return (
      <CoverCapture
        onCapture={(blob) => {
          storage.saveCoverPhoto(edition.id, blob)
          setMode('view')
        }}
        onClose={() => setMode('view')}
      />
    )
  }
  if (mode === 'edit') return <EditBookForm edition={edition} onDone={() => setMode('view')} />

  return (
    <>
      <div className="book-detail">
        <BookCover src={coverFor(edition)} title={edition.title} size="lg" />
        <div>
          <p>{edition.author}</p>
          <p className="muted">
            Read {readings.length === 1 ? 'once' : `${readings.length} times`}
            {childName ? ` with ${childName}` : ''}
            {first && last && first !== last ? (
              <>
                <br />
                First {formatDisplayDate(first.date)}
                <br />
                Last {formatDisplayDate(last.date)}
              </>
            ) : (
              last && (
                <>
                  <br />
                  {formatDisplayDate(last.date)}
                </>
              )
            )}
          </p>
        </div>
      </div>

      {notes.length > 0 && (
        <>
          <span className="field-label">Notes</span>
          <ul className="book-notes">
            {notes.map((r) => (
              <li key={r.id}>
                <span className="muted">{formatDisplayDate(r.date)}</span> {r.note}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="book-actions">
        <button type="button" className="btn-secondary" onClick={() => setMode('edit')}>
          Edit title and author
        </button>
        <button type="button" className="btn-secondary" onClick={() => setMode('photo')}>
          📷 {hasCoverPhoto ? 'Retake cover photo' : 'Add a cover photo'}
        </button>
      </div>
    </>
  )
}

function EditBookForm({ edition, onDone }: { edition: Edition; onDone: () => void }) {
  const [title, setTitle] = useState(edition.title)
  const [author, setAuthor] = useState(edition.author)
  const [error, setError] = useState('')

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('A book needs a title.')
    try {
      await storage.updateEdition(edition.id, { title: title.trim(), author: author.trim() || 'Unknown' })
      onDone()
    } catch (err) {
      setError(`Could not save: ${errorMessage(err)}`)
    }
  }

  return (
    <form onSubmit={save}>
      <label>
        <span className="field-label">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        <span className="field-label">Author</span>
        <input value={author} onChange={(e) => setAuthor(e.target.value)} />
      </label>
      <div className="book-actions">
        <button className="submit-btn" type="submit">
          Save
        </button>
        <button type="button" className="btn-secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
      {error && <p className="muted">{error}</p>}
    </form>
  )
}
