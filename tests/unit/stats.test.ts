import { describe, expect, it } from 'vitest'
import { dailySeries, dayTotals, periodTotal, splitByDay, streak, STREAK_THRESHOLD_SECONDS } from '@/lib/stats/stats'
import { dayKey } from '@/lib/dates'

// Tests run with TZ=Europe/Berlin (vitest.config.ts). DST ends 2026-10-25 03:00.

let n = 0
function session(start: Date, minutes: number, opts: { end?: Date; subject?: string; deleted?: boolean } = {}) {
  const end = opts.end ?? new Date(start.getTime() + minutes * 60_000)
  return {
    id: String(n++),
    subject_id: opts.subject ?? 'a',
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    duration_seconds: minutes * 60,
    deleted_at: opts.deleted ? new Date().toISOString() : null,
  }
}
const local = (y: number, m: number, d: number, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi)

describe('splitByDay', () => {
  it('keeps a same-day session on that day', () => {
    expect([...splitByDay(session(local(2026, 10, 2, 9), 90))]).toEqual([['2026-10-02', 5400]])
  })

  it('splits a session across midnight proportionally', () => {
    const m = splitByDay(session(local(2026, 10, 2, 23, 30), 60))
    expect(m.get('2026-10-02')).toBe(1800)
    expect(m.get('2026-10-03')).toBe(1800)
  })

  it('keeps the total exact after rounding', () => {
    const m = splitByDay(session(local(2026, 10, 2, 23, 59), 7, { end: local(2026, 10, 3, 0, 6) }))
    expect([...m.values()].reduce((a, b) => a + b, 0)).toBe(420)
  })

  it('scales by duration when the wall span includes pauses', () => {
    // 2 h wall span, 1 h studied, half before midnight.
    const m = splitByDay(session(local(2026, 10, 2, 23), 60, { end: local(2026, 10, 3, 1) }))
    expect(m.get('2026-10-02')).toBe(1800)
    expect(m.get('2026-10-03')).toBe(1800)
  })

  it('counts a session ending exactly at midnight on the earlier day', () => {
    const m = splitByDay(session(local(2026, 10, 2, 23), 60))
    expect([...m]).toEqual([['2026-10-02', 3600]])
  })
})

describe('dayTotals and periods', () => {
  const now = local(2026, 10, 2, 18) // Friday
  const sessions = [
    session(local(2026, 10, 2, 9), 60, { subject: 'a' }),
    session(local(2026, 10, 2, 14), 30, { subject: 'b' }),
    session(local(2026, 9, 28, 10), 45, { subject: 'a' }), // Monday, same week
    session(local(2026, 9, 27, 10), 20, { subject: 'a' }), // Sunday, previous week, same... September
    session(local(2026, 10, 1, 10), 999, { deleted: true }),
  ]
  const totals = dayTotals(sessions)

  it('ignores deleted sessions', () => {
    expect(totals.all.get('2026-10-01')).toBeUndefined()
  })

  it('computes today, week (Monday start) and month', () => {
    expect(periodTotal(totals.all, 'today', now)).toBe(90 * 60)
    expect(periodTotal(totals.all, 'week', now)).toBe(135 * 60)
    expect(periodTotal(totals.all, 'month', now)).toBe(90 * 60)
  })

  it('breaks down by subject', () => {
    expect(periodTotal(totals.bySubject.get('a'), 'week', now)).toBe(105 * 60)
    expect(periodTotal(totals.bySubject.get('b'), 'week', now)).toBe(30 * 60)
  })

  it('builds a daily series ending today', () => {
    const s = dailySeries(totals.all, now, 7)
    expect(s).toHaveLength(7)
    expect(s.at(-1)?.key).toBe('2026-10-02')
    expect(s.at(-1)?.seconds).toBe(5400)
    expect(s[0]?.key).toBe('2026-09-26')
  })

  it('has one entry per day across the DST change', () => {
    const s = dailySeries(new Map(), local(2026, 10, 27), 4)
    expect(s.map((d) => d.key)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])
  })
})

describe('streak', () => {
  const T = STREAK_THRESHOLD_SECONDS
  const days = (entries: [string, number][]) => new Map(entries)
  const now = local(2026, 10, 2, 20)

  it('is zero without qualifying days', () => {
    expect(streak(new Map(), now)).toBe(0)
  })

  it('counts consecutive days ending today', () => {
    expect(streak(days([['2026-10-02', T], ['2026-10-01', T], ['2026-09-30', T]]), now)).toBe(3)
  })

  it('keeps yesterday’s streak while today is not yet reached', () => {
    expect(streak(days([['2026-10-02', T - 1], ['2026-10-01', T], ['2026-09-30', T]]), now)).toBe(2)
  })

  it('breaks on a gap', () => {
    expect(streak(days([['2026-10-02', T], ['2026-09-30', T]]), now)).toBe(1)
  })

  it('breaks when a day is under the threshold', () => {
    expect(streak(days([['2026-10-02', T], ['2026-10-01', T - 60], ['2026-09-30', T]]), now)).toBe(1)
  })

  it('is zero when neither today nor yesterday qualifies', () => {
    expect(streak(days([['2026-09-30', T]]), now)).toBe(0)
  })

  it('spans the DST change', () => {
    const d = days([['2026-10-24', T], ['2026-10-25', T], ['2026-10-26', T]])
    expect(streak(d, local(2026, 10, 26, 9))).toBe(3)
  })

  it('uses local days, not UTC days', () => {
    // 00:30 local on Oct 2 is still Oct 1 in UTC.
    const totals = dayTotals([session(local(2026, 10, 2, 0, 30), 30), session(local(2026, 10, 1, 12), 30)])
    expect(dayKey(local(2026, 10, 2, 0, 30))).toBe('2026-10-02')
    expect(streak(totals.all, local(2026, 10, 2, 9))).toBe(2)
  })
})

describe('stableUuid', () => {
  it('is deterministic and a valid UUID', async () => {
    const { stableUuid, goalKey } = await import('@/lib/ids')
    const a = await stableUuid(goalKey('u1', null, 'daily'))
    expect(a).toBe(await stableUuid(goalKey('u1', null, 'daily')))
    expect(a).not.toBe(await stableUuid(goalKey('u1', null, 'weekly')))
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
