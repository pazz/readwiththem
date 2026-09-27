import { useReducer, useRef, useState, type FormEvent } from 'react'
import type { Child, Edition, ReadingSession } from '../../types'
import type { CoverLookup } from '../../data/useLibrary'
import * as storage from '../../data/storage'
import { pickPraise } from '../../praise'
import { toISODate } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { useObjectUrl } from '../../lib/useObjectUrl'
import { StarRating } from '../../components/StarRating'
import { Toast, useToast } from '../../components/Toast'
import { CoverCapture } from '../../components/CoverCapture'
import { DateField } from '../../components/DateField'
import { chosenBook, initialLogForm, logFormReducer } from './logForm'
import { BookPicker } from './BookPicker'
import './LogView.css'

// Logs a reading for the active child: a book, then date, rating and note.
export function LogView({
  activeChild,
  children,
  editions,
  sessions,
  coverFor,
  onChooseChild,
}: {
  activeChild: Child | undefined
  children: Child[]
  editions: Edition[]
  sessions: ReadingSession[]
  coverFor: CoverLookup
  onChooseChild: () => void
}) {
  const [form, dispatch] = useReducer(logFormReducer, toISODate(new Date()), initialLogForm)
  const [coverPhoto, setCoverPhoto] = useState<Blob | null>(null)
  const [capturingCover, setCapturingCover] = useState(false)
  const coverPreview = useObjectUrl(coverPhoto)
  const [toast, showToast] = useToast(3300)
  // So two readings logged back to back never get the same joke twice running.
  const lastPraiseTemplate = useRef<string>(undefined)

  if (!activeChild) {
    return (
      <div className="card empty-state">
        <span className="empty-icon" aria-hidden="true">
          📖
        </span>
        <p className="muted">No child selected yet.</p>
        <button className="submit-btn" onClick={onChooseChild}>
          Choose or add a child
        </button>
      </div>
    )
  }

  const others = children.filter((c) => c.id !== activeChild.id)

  const logReadingOf = async (edition: Edition, title: string) => {
    const childIds = [activeChild.id, ...form.alsoFor.filter((id) => others.some((c) => c.id === id))]
    for (const childId of childIds) {
      await storage.logReading({
        childId,
        editionId: edition.id,
        date: form.date,
        note: form.note.trim() || undefined,
        rating: form.rating ? Number(form.rating) : undefined,
      })
    }
    dispatch({ type: 'logged' })
    const praise = pickPraise(title, lastPraiseTemplate.current)
    lastPraiseTemplate.current = praise.template
    showToast(praise.message)
  }

  // One tap logs the book, with no second step.
  const readAgain = async (edition: Edition) => {
    try {
      await logReadingOf(edition, edition.title)
    } catch (err) {
      console.error('readAgain failed', err)
      dispatch({ type: 'status', status: `Could not save: ${errorMessage(err)}` })
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const book = chosenBook(form)
    if (!book) return dispatch({ type: 'status', status: 'Search and pick a book, or enter a title manually.' })
    try {
      const edition = await storage.addEdition({
        title: book.title,
        author: book.author,
        coverUrl: book.coverUrl,
        isbn: book.isbn,
        source: book.source,
      })
      if (coverPhoto) await storage.saveCoverPhoto(edition.id, coverPhoto)
      await logReadingOf(edition, book.title)
      dispatch({ type: 'bookLogged' })
      setCoverPhoto(null)
    } catch (err) {
      console.error('logReading failed', err)
      dispatch({ type: 'status', status: `Could not save: ${errorMessage(err)}` })
    }
  }

  const coverControl = capturingCover ? (
    <CoverCapture
      onCapture={(blob) => {
        setCoverPhoto(blob)
        setCapturingCover(false)
      }}
      onClose={() => setCapturingCover(false)}
    />
  ) : (
    <button type="button" className="link-btn" onClick={() => setCapturingCover(true)}>
      📷 {coverPhoto ? 'Retake cover photo' : 'Add a cover photo'}
    </button>
  )

  return (
    <div>
      <form className="card" onSubmit={submit}>
        <p className="muted">
          New reading for <strong>{activeChild.name}</strong>
        </p>
        {others.length > 0 && (
          <div className="also-read" role="group" aria-label="Also read with">
            <span className="muted">Also with</span>
            {others.map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip"
                aria-pressed={form.alsoFor.includes(c.id)}
                onClick={() => dispatch({ type: 'toggleAlso', childId: c.id })}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div>
          <span className="field-label">Book</span>
          <BookPicker
            form={form}
            dispatch={dispatch}
            childId={activeChild.id}
            editions={editions}
            sessions={sessions}
            coverFor={coverFor}
            coverPreview={coverPreview}
            capturingCover={capturingCover}
            coverControl={coverControl}
            onDeselect={() => {
              dispatch({ type: 'deselect' })
              setCoverPhoto(null)
            }}
            onReadAgain={readAgain}
          />
        </div>

        <div className="field-row">
          <DateField value={form.date} onChange={(value) => dispatch({ type: 'details', field: 'date', value })} />
          <div>
            <span className="field-label">Rating</span>
            <StarRating value={form.rating} onChange={(value) => dispatch({ type: 'details', field: 'rating', value })} />
          </div>
        </div>

        <textarea
          placeholder="Note (optional)"
          value={form.note}
          onChange={(e) => dispatch({ type: 'details', field: 'note', value: e.target.value })}
        />

        <button className="submit-btn" type="submit">
          Log reading
        </button>
        {form.status && <p className="muted">{form.status}</p>}
      </form>

      <Toast message={toast} />
    </div>
  )
}
