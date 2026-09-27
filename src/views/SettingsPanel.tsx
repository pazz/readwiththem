import { useState } from 'react'
import * as storage from '../data/storage'
import { daysSinceBackup, downloadBackup } from '../data/downloadBackup'
import { usePref, writePref, type ReadingGoal, type ThemePref, type WeekStart } from '../lib/prefs'
import { Panel } from '../components/Panel'
import { Segmented } from '../components/Segmented'
import { RestoreBackupButton } from '../components/RestoreBackupButton'
import { ImportReadingsButton } from '../components/ImportReadingsButton'
import { AboutFooter } from '../components/AboutFooter'
import './SettingsPanel.css'

export function SettingsPanel({
  open,
  onClose,
  onOpenChildren,
  persistentStorage,
}: {
  open: boolean
  onClose: () => void
  onOpenChildren: () => void
  persistentStorage: boolean | undefined
}) {
  const [theme, setTheme] = usePref('theme')
  const [weekStart, setWeekStart] = usePref('weekStart')
  const [goal, setGoal] = usePref('readingGoal')
  const [goalText, setGoalText] = useState(String(goal.target))
  const [lastBackupAt] = usePref('lastBackupAt')
  const days = daysSinceBackup(lastBackupAt)

  const resetAll = async () => {
    if (
      !confirm(
        'Delete everything in this browser — every child, book and reading? This cannot be undone. Download a backup first if you want to keep it.',
      )
    )
      return
    await storage.resetAllData()
    writePref('activeChildId', null)
    window.location.replace(window.location.pathname)
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
        <span className="settings-row-icon" aria-hidden="true">
          ›
        </span>
      </button>

      <h3 className="settings-heading">Preferences</h3>
      <div className="settings-field">
        <span className="field-label" id="theme-label">
          Theme
        </span>
        <Segmented<ThemePref>
          labelledBy="theme-label"
          value={theme}
          onChange={setTheme}
          options={[
            ['system', 'Automatic'],
            ['light', 'Light'],
            ['dark', 'Dark'],
          ]}
        />
      </div>
      <div className="settings-field">
        <span className="field-label" id="week-label">
          Weeks start on
        </span>
        <Segmented<WeekStart>
          labelledBy="week-label"
          value={weekStart}
          onChange={setWeekStart}
          options={[
            ['monday', 'Monday'],
            ['sunday', 'Sunday'],
          ]}
        />
      </div>
      <div className="settings-field">
        <span className="field-label" id="goal-label">
          Reading goal
        </span>
        <Segmented<ReadingGoal['period']>
          labelledBy="goal-label"
          value={goal.period}
          onChange={(period) => setGoal({ ...goal, period })}
          options={[
            ['off', 'Off'],
            ['week', 'Weekly'],
            ['month', 'Monthly'],
            ['year', 'Yearly'],
          ]}
        />
        {goal.period !== 'off' && (
          <label className="goal-target">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={goalText}
              onChange={(e) => {
                setGoalText(e.target.value)
                const n = Number(e.target.value)
                if (Number.isInteger(n) && n >= 1) setGoal({ ...goal, target: n })
              }}
            />
            books a {goal.period} with each child
          </label>
        )}
        <span className="muted">
          Counts re-reads too, and starts afresh each {goal.period === 'off' ? 'week, month or year' : goal.period}.
        </span>
      </div>

      <h3 className="settings-heading">Your data</h3>
      <button type="button" className="settings-row" onClick={downloadBackup}>
        <span>
          <strong>Download full backup</strong>
          <span className="muted">
            {days === undefined
              ? 'Not yet backed up from this device. Keep a copy safe: the data lives nowhere else.'
              : `Last backup ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}. Keep it safe: the data lives nowhere else.`}
          </span>
        </span>
      </button>
      <RestoreBackupButton variant="settings" />
      <ImportReadingsButton />
      <button type="button" className="settings-row danger-row" onClick={resetAll}>
        <span>
          <strong>Reset all data</strong>
          <span className="muted">Deletes every child, book and reading from this browser.</span>
        </span>
      </button>

      <div className="settings-about muted">
        <strong>Privacy</strong>
        <p>Everything you log stays in this browser. Nothing is ever sent anywhere.</p>
        {persistentStorage === false && (
          <p>This browser may clear its storage if space runs low. Add the app to your home screen, and download a backup now and then.</p>
        )}
        <AboutFooter />
      </div>
    </Panel>
  )
}
