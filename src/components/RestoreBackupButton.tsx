import { useRef, useState } from 'react'
import * as storage from '../data/storage'
import { writePref } from '../lib/prefs'
import { withTimeout, errorMessage, BLOCKED_TAB_HINT } from '../lib/errors'

// Restores a downloaded backup, from Settings or from the very first screen
// (moving to a new device, or recovering after storage was cleared). A restore
// replaces everything in this browser, so it asks first, then reloads the page
// rather than resyncing every piece of React state by hand.
export function RestoreBackupButton({ variant }: { variant: 'settings' | 'welcome' }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'restoring' | 'error'>('idle')
  const [error, setError] = useState('')

  const handleFile = async (file: File) => {
    if (!confirm('Restore this backup? Everything currently in this browser will be replaced. This cannot be undone.')) return
    setStatus('restoring')
    setError('')
    try {
      await withTimeout(storage.importBackupJSON(await file.text()), 15_000, BLOCKED_TAB_HINT)
      writePref('activeChildId', null)
      window.location.replace(window.location.pathname)
    } catch (err) {
      console.error('backup restore failed', err)
      setStatus('error')
      setError(errorMessage(err))
    }
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="application/json,.json"
      className="visually-hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) handleFile(file)
      }}
    />
  )

  if (variant === 'settings') {
    return (
      <>
        {input}
        <button type="button" className="settings-row" disabled={status === 'restoring'} onClick={() => inputRef.current?.click()}>
          <span>
            <strong>Restore from backup</strong>
            <span className="muted">
              {status === 'restoring'
                ? 'Restoring…'
                : status === 'error'
                  ? `Could not restore: ${error}`
                  : 'Replaces everything above with a backup file.'}
            </span>
          </span>
        </button>
      </>
    )
  }

  return (
    <>
      {input}
      <button type="button" className="link-btn" disabled={status === 'restoring'} onClick={() => inputRef.current?.click()}>
        {status === 'restoring' ? 'Restoring…' : 'Already have a backup? Restore it'}
      </button>
      {status === 'error' && <p className="muted">Could not restore: {error}</p>}
    </>
  )
}
