import { backupReminderDue, daysSinceBackup, downloadBackup, snoozeBackupReminder } from '../../data/downloadBackup'
import { usePref } from '../../lib/prefs'

// A gentle prompt when there is something to lose and no recent backup.
export function BackupReminder({ readingCount }: { readingCount: number }) {
  const [lastBackupAt] = usePref('lastBackupAt')
  const [snoozedUntil] = usePref('backupReminderSnoozedUntil')
  if (!backupReminderDue(readingCount, lastBackupAt, snoozedUntil)) return null
  const days = daysSinceBackup(lastBackupAt)
  return (
    <div className="card backup-reminder" role="note">
      <p>
        {days === undefined ? 'Your readings are saved only on this device.' : `Your last backup was ${days} days ago.`} A backup file keeps
        them safe if the phone is lost or the browser is cleared.
      </p>
      <div className="backup-reminder-actions">
        <button type="button" className="submit-btn" onClick={downloadBackup}>
          Download backup
        </button>
        <button type="button" className="link-btn" onClick={() => snoozeBackupReminder()}>
          Remind me later
        </button>
      </div>
    </div>
  )
}
