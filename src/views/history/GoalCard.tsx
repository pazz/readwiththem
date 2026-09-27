import type { Child, ReadingSession } from '../../types'
import { periodRange } from '../../lib/dates'
import { usePref } from '../../lib/prefs'

const PERIOD_WORDS = { week: 'this week', month: 'this month', year: 'this year' } as const

// Progress towards the reading goal (Settings) in the current week, month or
// year, counting every reading, re-reads included. Starts afresh each period.
export function GoalCard({ child, readings }: { child: Child; readings: ReadingSession[] }) {
  const [goal] = usePref('readingGoal')
  const [weekStart] = usePref('weekStart')
  if (goal.period === 'off') return null
  const [from, to] = periodRange(goal.period, weekStart)
  const count = readings.filter((r) => r.date >= from && r.date <= to).length
  const when = PERIOD_WORDS[goal.period]
  return (
    <div className="card goal-card">
      <p>
        {count >= goal.target ? (
          <>
            Goal reached: <strong>{count}</strong> {count === 1 ? 'book' : 'books'} with {child.name} {when}!
          </>
        ) : (
          <>
            <strong>{count}</strong> of {goal.target} books with {child.name} {when}
          </>
        )}
      </p>
      <progress max={goal.target} value={Math.min(count, goal.target)} aria-label="Reading goal progress" />
    </div>
  )
}
