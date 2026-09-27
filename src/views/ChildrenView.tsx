import { useState, type FormEvent } from 'react'
import type { Child, ReadingSession } from '../types'
import * as storage from '../data/storage'
import { DEFAULT_COLOUR } from '../theme'
import { withTimeout, errorMessage, BLOCKED_TAB_HINT } from '../lib/errors'
import { ColourPicker } from '../components/ColourPicker'
import { Panel } from '../components/Panel'
import { RestoreBackupButton } from '../components/RestoreBackupButton'
import './ChildrenView.css'

// Choose who you're reading with, add a child, set their colour, or remove them.
export function ChildrenView({
  children,
  sessions,
  activeChildId,
  onSelect,
  onCreated,
  onDeleted,
}: {
  children: Child[]
  sessions: ReadingSession[]
  activeChildId: string | undefined
  onSelect: (id: string) => void
  onCreated: (id: string) => void
  onDeleted: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const editing = children.find((c) => c.id === editingId)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const child = await withTimeout(storage.addChild(name.trim(), birthYear ? Number(birthYear) : undefined), 15_000, BLOCKED_TAB_HINT)
      setName('')
      setBirthYear('')
      onCreated(child.id)
    } catch (err) {
      console.error('addChild failed', err)
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const addForm = (
    <div className="card">
      <h3>{children.length === 0 ? 'Who are you reading with?' : 'Add a child'}</h3>
      <form onSubmit={submit}>
        <input placeholder="Child's name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Birth year (optional)" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} type="number" />
        <button className="submit-btn" type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add child'}
        </button>
        {error && <p className="muted">Could not save: {error}</p>}
      </form>
      {children.length === 0 && (
        <div className="restore-hint">
          <RestoreBackupButton variant="welcome" />
        </div>
      )}
    </div>
  )

  if (children.length === 0) {
    return (
      <div>
        {addForm}
        <div className="card empty-state">
          <span className="empty-icon" aria-hidden="true">
            🧒
          </span>
          Add a child above to get started.
        </div>
      </div>
    )
  }

  // With children already added, choosing one is the main job here, so the
  // list comes first and the add form second.
  return (
    <div>
      <div className="card">
        <h3>Who are you reading with?</h3>
        <ul className="child-list">
          {children.map((c) => {
            const readingCount = sessions.filter((s) => s.childId === c.id).length
            return (
              <li key={c.id}>
                <button type="button" className={c.id === activeChildId ? 'child-active' : ''} onClick={() => onSelect(c.id)}>
                  {c.id === activeChildId ? '✓ ' : ''}
                  {c.name}
                  {c.birthYear ? ` (b. ${c.birthYear})` : ''}
                </button>
                <ColourPicker
                  value={c.colour ?? DEFAULT_COLOUR}
                  childName={c.name}
                  onChange={(colour) => storage.updateChild(c.id, { colour })}
                />
                <button type="button" className="link-btn child-edit" onClick={() => setEditingId(c.id)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="link-btn danger child-remove"
                  onClick={() => {
                    const warning =
                      readingCount > 0 ? ` This also removes ${readingCount} reading${readingCount === 1 ? '' : 's'} logged for them.` : ''
                    if (confirm(`Remove ${c.name}?${warning} This cannot be undone.`)) storage.deleteChild(c.id).then(() => onDeleted(c.id))
                  }}
                >
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {addForm}

      <Panel open={!!editing} onClose={() => setEditingId(undefined)} variant="sheet" title={`Edit ${editing?.name ?? ''}`}>
        {editing && <EditChildForm key={editing.id} child={editing} onDone={() => setEditingId(undefined)} />}
      </Panel>
    </div>
  )
}

function EditChildForm({ child, onDone }: { child: Child; onDone: () => void }) {
  const [name, setName] = useState(child.name)
  const [birthYear, setBirthYear] = useState(child.birthYear ? String(child.birthYear) : '')
  const [error, setError] = useState('')

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('A child needs a name.')
    try {
      await storage.updateChild(child.id, { name: name.trim(), birthYear: birthYear ? Number(birthYear) : undefined })
      onDone()
    } catch (err) {
      setError(`Could not save: ${errorMessage(err)}`)
    }
  }

  return (
    <form onSubmit={save}>
      <label>
        <span className="field-label">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        <span className="field-label">Birth year (optional)</span>
        <input type="number" inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} />
      </label>
      <button className="submit-btn" type="submit">
        Save
      </button>
      {error && <p className="muted">{error}</p>}
    </form>
  )
}
