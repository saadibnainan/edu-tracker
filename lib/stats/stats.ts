// Study statistics. All day boundaries are local calendar days.

import { addDays, dayKey, startOfDay, startOfMonth, startOfNextMonth, startOfWeek } from '@/lib/dates'
import type { Session } from '@/lib/types'

export const STREAK_THRESHOLD_SECONDS = 30 * 60

type SessionLike = Pick<Session, 'started_at' | 'ended_at' | 'duration_seconds' | 'subject_id' | 'deleted_at'>

/**
 * Spreads a session's studied seconds over the local days its wall-clock span
 * touches, proportional to the overlap. A session from 23:30 to 00:30 counts
 * half on each day. Duration excludes pauses, so it is scaled, not replaced.
 */
export function splitByDay(s: SessionLike): Map<string, number> {
  const out = new Map<string, number>()
  const start = new Date(s.started_at)
  const end = new Date(s.ended_at)
  const span = end.getTime() - start.getTime()
  if (span <= 0 || dayKey(start) === dayKey(end)) {
    out.set(dayKey(start), s.duration_seconds)
    return out
  }
  let cursor = start
  let assigned = 0
  while (cursor < end) {
    const next = startOfDay(addDays(cursor, 1))
    const sliceEnd = next < end ? next : end
    const portion = Math.round((s.duration_seconds * (sliceEnd.getTime() - cursor.getTime())) / span)
    out.set(dayKey(cursor), (out.get(dayKey(cursor)) ?? 0) + portion)
    assigned += portion
    cursor = sliceEnd
  }
  // Rounding drift goes to the last day so totals stay exact.
  const lastKey = dayKey(new Date(end.getTime() - 1))
  out.set(lastKey, (out.get(lastKey) ?? 0) + (s.duration_seconds - assigned))
  return out
}

export interface DayTotals {
  /** dayKey -> seconds */
  all: Map<string, number>
  /** subjectId -> dayKey -> seconds */
  bySubject: Map<string, Map<string, number>>
}

export function dayTotals(sessions: readonly SessionLike[]): DayTotals {
  const all = new Map<string, number>()
  const bySubject = new Map<string, Map<string, number>>()
  for (const s of sessions) {
    if (s.deleted_at) continue
    let sub = bySubject.get(s.subject_id)
    if (!sub) bySubject.set(s.subject_id, (sub = new Map()))
    for (const [k, v] of splitByDay(s)) {
      all.set(k, (all.get(k) ?? 0) + v)
      sub.set(k, (sub.get(k) ?? 0) + v)
    }
  }
  return { all, bySubject }
}

/** Sum of seconds for local days in [from, to). */
export function sumRange(days: Map<string, number> | undefined, from: Date, to: Date): number {
  if (!days) return 0
  let total = 0
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) total += days.get(dayKey(d)) ?? 0
  return total
}

export type Period = 'today' | 'week' | 'month'

export function periodRange(period: Period, now: Date): { from: Date; to: Date } {
  if (period === 'today') return { from: startOfDay(now), to: startOfDay(addDays(now, 1)) }
  if (period === 'week') {
    const from = startOfWeek(now)
    return { from, to: addDays(from, 7) }
  }
  return { from: startOfMonth(now), to: startOfNextMonth(now) }
}

export function periodTotal(days: Map<string, number> | undefined, period: Period, now: Date): number {
  const { from, to } = periodRange(period, now)
  return sumRange(days, from, to)
}

/** One entry per local day for the last `count` days, oldest first, ending today. */
export function dailySeries(days: Map<string, number>, now: Date, count: number): { key: string; date: Date; seconds: number }[] {
  const today = startOfDay(now)
  const out: { key: string; date: Date; seconds: number }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    const key = dayKey(date)
    out.push({ key, date, seconds: days.get(key) ?? 0 })
  }
  return out
}

/**
 * Consecutive local days with at least the threshold, ending today. If today
 * has not reached the threshold yet, the streak ending yesterday still counts,
 * so it does not reset at midnight before the user has had a chance to study.
 */
export function streak(days: Map<string, number>, now: Date, threshold = STREAK_THRESHOLD_SECONDS): number {
  let cursor = startOfDay(now)
  if ((days.get(dayKey(cursor)) ?? 0) < threshold) cursor = addDays(cursor, -1)
  let count = 0
  while ((days.get(dayKey(cursor)) ?? 0) >= threshold) {
    count++
    cursor = addDays(cursor, -1)
  }
  return count
}

