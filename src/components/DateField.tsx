import { addDays, toISODate } from '../lib/dates'
import './DateField.css'

// A date input with one-tap Today and Yesterday, since readings are often
// logged the morning after.
export function DateField({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const today = toISODate(new Date())
  const yesterday = addDays(today, -1)
  return (
    <div className="date-field">
      <label>
        <span className="field-label">Date</span>
        <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      <div className="date-shortcuts">
        <button type="button" className="chip" aria-pressed={value === today} onClick={() => onChange(today)}>
          Today
        </button>
        <button type="button" className="chip" aria-pressed={value === yesterday} onClick={() => onChange(yesterday)}>
          Yesterday
        </button>
      </div>
    </div>
  )
}
