import { describe, expect, it } from 'vitest'
import { formatClock, formatDuration, formatShortClock, parseHoursInput, parseTags } from '@/lib/format'

describe('parseHoursInput', () => {
  it.each([
    ['3', 180],
    ['2:30', 150],
    ['1.5', 90],
    ['1,5', 90],
    ['2h', 120],
    ['90m', 90],
    ['45 min', 45],
    [' 4 ', 240],
  ])('%s -> %i minutes', (input, minutes) => {
    expect(parseHoursInput(input)).toBe(minutes)
  })

  it.each(['', 'abc', '2:75', '-1', '1:2'])('rejects %s', (input) => {
    expect(parseHoursInput(input)).toBeNull()
  })
})

describe('formatting', () => {
  it('formats clocks and durations', () => {
    expect(formatClock(5_047_000)).toBe('01:24:07')
    expect(formatClock(-5)).toBe('00:00:00')
    expect(formatShortClock(1_447_000)).toBe('24:07')
    expect(formatShortClock(3_600_000)).toBe('01:00:00')
    expect(formatDuration(9660)).toBe('2:41')
    expect(formatDuration(0)).toBe('0:00')
  })

  it('normalizes tags', () => {
    expect(parseTags(' Exam, chapter  3,exam,, ')).toEqual(['exam', 'chapter 3'])
  })
})
