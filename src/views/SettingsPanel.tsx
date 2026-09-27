import * as storage from '../data/storage'
import { toISODate } from '../lib/dates'
import { download } from '../lib/download'
import { writePref } from '../lib/prefs'
import { Panel } from '../components/Panel'
import { RestoreBackupButton } from '../components/RestoreBackupButton'
import { AboutFooter } from '../components/AboutFooter'

export function SettingsPanel({ open, onClose, onOpenChildren }: { open: boolean; onClose: () => void; onOpenChildren: () => void }) {
  const downloadBackup = async () =>
    download(`readwiththem-backup-${toISODate(new Date())}.json`, await storage.exportBackupJSON(), 'application/json')

  const resetAll = async () => {
    if (!confirm('Delete everything in this browser — every child, book and reading? This cannot be undone. Download a backup first if you want to keep it.')) return
    await storage.resetAllData()
    writePref('activeChildId', null)
    window.location.reload()
  }

  return (
    <Panel open={open} onClose={onClose} variant="drawer" title="Settings">
      <button
        type="button"
        className="settings-row"
        onClick={() => {
          onClose()
          onOpenChildren()
        }}
      >
        <span>
          <strong>Children</strong>
          <span className="muted">Add a child, or switch who you're logging for</span>
        </span>
        <span className="settings-row-icon" aria-hidden="true">›</span>
      </button>
      <button type="button" className="settings-row" onClick={downloadBackup}>
        <span>
          <strong>Download full backup</strong>
          <span className="muted">Everything in this browser, as JSON. Keep it safe: the data lives nowhere else.</span>
        </span>
      </button>
      <RestoreBackupButton variant="settings" />
      <button type="button" className="settings-row danger-row" onClick={resetAll}>
        <span>
          <strong>Reset all data</strong>
          <span className="muted">Deletes every child, book and reading from this browser.</span>
        </span>
      </button>
      <div className="settings-about muted">
        <strong>Privacy</strong>
        <p>Everything you log stays in this browser. Nothing is ever sent anywhere.</p>
        <AboutFooter />
      </div>
    </Panel>
  )
}
