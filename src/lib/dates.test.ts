import { describe, expect, it } from 'vitest'
import { addDays, endOfWeek, periodRange, formatDateRangeLabel, formatDisplayDate, startOfWeek, toISODate } from './dates'

// Wednesday 16 September 2026.
const wednesday = new Date(2026, 8, 16)

describe('dates', () => {
  it('starts the week on Monday or Sunday', () => {
    expect(toISODate(startOfWeek(wednesday, 'monday'))).toBe('2026-09-14')
    expect(toISODate(endOfWeek(wednesday, 'monday'))).toBe('2026-09-20')
    expect(toISODate(startOfWeek(wednesday, 'sunday'))).toBe('2026-09-13')
    expect(toISODate(endOfWeek(wednesday, 'sunday'))).toBe('2026-09-19')
  })

  it('gives the current week, month or year', () => {
    expect(periodRange('week', 'sunday', wednesday)).toEqual(['2026-09-13', '2026-09-19'])
    expect(periodRange('month', 'monday', wednesday)).toEqual(['2026-09-01', '2026-09-30'])
    expect(periodRange('year', 'monday', wednesday)).toEqual(['2026-01-01', '2026-12-31'])
  })

  it('adds days across month ends', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
  })

  it('formats dates and ranges for people', () => {
    expect(formatDisplayDate('2026-09-12')).toBe('Sat 12 Sep 2026')
    expect(formatDateRangeLabel('', '')).toBe('All time')
    expect(formatDateRangeLabel('2026-09-01', '2026-09-30')).toBe('September 2026')
    expect(formatDateRangeLabel('2026-09-14', '2026-09-20')).toBe('14 Sep 2026 – 20 Sep 2026')
  })
})
