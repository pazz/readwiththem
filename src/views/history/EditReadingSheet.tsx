import { useState, type FormEvent } from 'react'
import type { Child, ReadingSession } from '../../types'
import * as storage from '../../data/storage'
import { errorMessage } from '../../lib/errors'
import { Panel } from '../../components/Panel'
import { StarRating } from '../../components/StarRating'
import { DateField } from '../../components/DateField'

// Corrects a logged reading: date, child, rating and note.
export function EditReadingSheet({
  reading,
  bookTitle,
  children,
  onClose,
}: {
  reading: ReadingSession | undefined
  bookTitle: string
  children: Child[]
  onClose: () => void
}) {
  return (
    <Panel open={!!reading} onClose={onClose} variant="sheet" title="Edit reading">
      {/* Keyed so each reading starts from its own values. */}
      {reading && <EditReadingForm key={reading.id} reading={reading} bookTitle={bookTitle} children={children} onDone={onClose} />}
    </Panel>
  )
}

function EditReadingForm({
  reading,
  bookTitle,
  children,
  onDone,
}: {
  reading: ReadingSession
  bookTitle: string
  children: Child[]
  onDone: () => void
}) {
  const [date, setDate] = useState(reading.date)
  const [childId, setChildId] = useState(reading.childId)
  const [rating, setRating] = useState(reading.rating ? String(reading.rating) : '')
  const [note, setNote] = useState(reading.note ?? '')
  const [error, setError] = useState('')

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!date) return setError('Choose a date.')
    try {
      await storage.updateSession(reading.id, {
        date,
        childId,
        rating: rating ? Number(rating) : undefined,
        note: note.trim() || undefined,
      })
      onDone()
    } catch (err) {
      setError(`Could not save: ${errorMessage(err)}`)
    }
  }

  return (
    <form onSubmit={save}>
      <p className="muted">{bookTitle}</p>
      <div className="field-row">
        <DateField value={date} onChange={setDate} />
        <div>
          <span className="field-label">Rating</span>
          <StarRating value={rating} onChange={setRating} />
        </div>
      </div>
      {children.length > 1 && (
        <label>
          <span className="field-label">Read with</span>
          <select value={childId} onChange={(e) => setChildId(e.target.value)}>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <textarea placeholder="Note (optional)" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="submit-btn" type="submit">
        Save
      </button>
      {error && <p className="muted">{error}</p>}
    </form>
  )
}
