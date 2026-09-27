import { toISODate } from '../lib/dates'
import { download } from '../lib/download'
import { writePref } from '../lib/prefs'
import { exportBackupJSON } from './storage'

// Saves a full backup file and remembers when, for the backup reminder.
export async function downloadBackup(): Promise<void> {
  download(`readwiththem-backup-${toISODate(new Date())}.json`, await exportBackupJSON(), 'application/json')
  writePref('lastBackupAt', new Date().toISOString())
}

const DAY_MS = 86_400_000
export const BACKUP_REMINDER_DAYS = 30

// Whole days since the last backup on this device, or undefined for never.
export function daysSinceBackup(lastBackupAt: string, now = Date.now()): number | undefined {
  return lastBackupAt ? Math.floor((now - Date.parse(lastBackupAt)) / DAY_MS) : undefined
}

// Due once there is something to lose and no recent backup, unless snoozed.
export function backupReminderDue(readingCount: number, lastBackupAt: string, snoozedUntil: string, now = Date.now()): boolean {
  if (readingCount < 5 || (snoozedUntil && Date.parse(snoozedUntil) > now)) return false
  const days = daysSinceBackup(lastBackupAt, now)
  return days === undefined || days >= BACKUP_REMINDER_DAYS
}

export function snoozeBackupReminder(days = 7): void {
  writePref('backupReminderSnoozedUntil', new Date(Date.now() + days * DAY_MS).toISOString())
}
