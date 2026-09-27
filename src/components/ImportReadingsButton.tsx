import { useRef, useState } from 'react'
import * as storage from '../data/storage'
import { readingsFromCSV } from '../export/csv'
import { errorMessage } from '../lib/errors'

// Adds readings from a spreadsheet (CSV) to what is already in this browser.
export function ImportReadingsButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const handleFile = async (file: File) => {
    try {
      const rows = readingsFromCSV(await file.text())
      const children = new Set(rows.map((r) => r.child)).size
      if (
        !confirm(
          `Add ${rows.length} reading${rows.length === 1 ? '' : 's'} for ${children} child${children === 1 ? '' : 'ren'}? Everything already here is kept.`,
        )
      )
        return
      setBusy(true)
      const { added, skipped, newChildren } = await storage.importReadings(rows)
      setStatus(
        [
          `Added ${added} reading${added === 1 ? '' : 's'}`,
          skipped ? `${skipped} already here` : '',
          newChildren.length ? `new: ${newChildren.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      )
    } catch (err) {
      setStatus(`Could not import: ${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) handleFile(file)
        }}
      />
      <button type="button" className="settings-row" disabled={busy} onClick={() => inputRef.current?.click()}>
        <span>
          <strong>Import readings from a spreadsheet</strong>
          <span className="muted">
            {busy ? 'Importing…' : status || 'A CSV with date, child and title columns, like the export. Adds to what is here.'}
          </span>
        </span>
      </button>
    </>
  )
}
