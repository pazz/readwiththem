import { describe, expect, it } from 'vitest'
import { backupReminderDue, daysSinceBackup } from './downloadBackup'

const now = Date.parse('2026-09-27T12:00:00Z')
const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString()

describe('backup reminder', () => {
  it('counts whole days since the last backup', () => {
    expect(daysSinceBackup('', now)).toBeUndefined()
    expect(daysSinceBackup(daysAgo(3.5), now)).toBe(3)
  })

  it('is due with five or more readings and no backup in 30 days', () => {
    expect(backupReminderDue(4, '', '', now)).toBe(false)
    expect(backupReminderDue(5, '', '', now)).toBe(true)
    expect(backupReminderDue(5, daysAgo(29), '', now)).toBe(false)
    expect(backupReminderDue(5, daysAgo(30), '', now)).toBe(true)
  })

  it('waits while snoozed', () => {
    expect(backupReminderDue(5, '', new Date(now + 1000).toISOString(), now)).toBe(false)
    expect(backupReminderDue(5, '', daysAgo(1), now)).toBe(true)
  })
})
