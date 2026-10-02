// Parses an iCalendar feed and expands events (including RRULE, EXDATE and
// RECURRENCE-ID overrides) that overlap a time window.
//
// Output times:
//   all-day   -> "YYYY-MM-DD"            (end exclusive)
//   floating  -> "YYYY-MM-DDTHH:mm:ss"   (wall clock, read in the viewer's zone)
//   zoned/UTC -> ISO 8601 with Z
// Floating and all-day values cannot be placed on a timeline on the server,
// which runs in UTC, so the browser converts them.

import ICAL from 'ical.js'

export interface IcsEvent {
  uid: string
  summary: string
  location: string | null
  start: string
  end: string
  allDay: boolean
}

type Time = InstanceType<typeof ICAL.Time>
type Event = InstanceType<typeof ICAL.Event>

const MAX_ITERATIONS = 20_000
const MAX_EVENTS = 1_000
/** Window slack for floating times, whose real instant depends on the viewer's zone. */
const SLACK_MS = 36 * 3_600_000

const pad = (n: number) => String(n).padStart(2, '0')

function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Offset of `tz` from UTC at instant `ms`, in ms. */
function zoneOffset(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(ms / 1000) * 1000
}

/** Converts a wall-clock time in IANA zone `tz` to a UTC instant. */
export function wallClockToUtc(t: { year: number; month: number; day: number; hour: number; minute: number; second: number }, tz: string): number {
  const guess = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second)
  let ms = guess - zoneOffset(guess, tz)
  ms = guess - zoneOffset(ms, tz)
  return ms
}

function isFloating(t: Time): boolean {
  return t.zone === ICAL.Timezone.localTimezone || t.zone?.tzid === 'floating'
}

function tzidOf(ev: Event, prop: 'dtstart' | 'dtend'): string | null {
  const p = ev.component.getFirstProperty(prop) ?? ev.component.getFirstProperty('dtstart')
  const v = p?.getParameter('tzid')
  return typeof v === 'string' ? v : null
}

interface Resolved {
  text: string
  /** Approximate instant for window filtering. */
  approx: number
  floating: boolean
}

function resolve(t: Time, tzid: string | null): Resolved {
  if (t.isDate) {
    return { text: `${t.year}-${pad(t.month)}-${pad(t.day)}`, approx: Date.UTC(t.year, t.month - 1, t.day), floating: true }
  }
  if (isFloating(t)) {
    // An unresolved TZID that is a valid IANA name is still placeable.
    if (tzid && isValidZone(tzid)) {
      const ms = wallClockToUtc(t, tzid)
      return { text: new Date(ms).toISOString(), approx: ms, floating: false }
    }
    const text = `${t.year}-${pad(t.month)}-${pad(t.day)}T${pad(t.hour)}:${pad(t.minute)}:${pad(t.second)}`
    return { text, approx: Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second), floating: true }
  }
  const ms = t.toUnixTime() * 1000
  return { text: new Date(ms).toISOString(), approx: ms, floating: false }
}

function endFor(start: Time, end: Time | null | undefined): Time {
  if (end && end.compare(start) > 0) return end
  const e = start.clone()
  if (start.isDate) e.day += 1
  return e
}

function isCancelled(ev: Event): boolean {
  const status = ev.component.getFirstPropertyValue('status')
  return typeof status === 'string' && status.toUpperCase() === 'CANCELLED'
}

function toEvent(ev: Event, start: Time, end: Time, from: number, to: number): IcsEvent | null {
  const s = resolve(start, tzidOf(ev, 'dtstart'))
  const e = resolve(endFor(start, end), tzidOf(ev, 'dtend'))
  const slackS = s.floating ? SLACK_MS : 0
  const slackE = e.floating ? SLACK_MS : 0
  if (s.approx - slackS >= to || e.approx + slackE <= from) return null
  const summary = (ev.summary ?? '').toString().trim() || 'Untitled'
  const location = (ev.location ?? '').toString().trim() || null
  return { uid: ev.uid ?? '', summary: summary.slice(0, 200), location: location?.slice(0, 200) ?? null, start: s.text, end: e.text, allDay: start.isDate }
}

/** True if the text looks like an iCalendar document. */
export function looksLikeIcs(text: string): boolean {
  return /^﻿?\s*BEGIN:VCALENDAR/i.test(text)
}

export function parseIcs(text: string, from: Date, to: Date): IcsEvent[] {
  if (!looksLikeIcs(text)) throw new Error('Not an iCalendar file')
  const jcal = ICAL.parse(text)
  const root = new ICAL.Component(Array.isArray(jcal[0]) ? (jcal[0] as unknown as typeof jcal) : jcal)
  const fromMs = from.getTime()
  const toMs = to.getTime()

  const masters = new Map<string, Event>()
  const orphans: Event[] = []
  const exceptions: Event[] = []
  for (const comp of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(comp)
    if (!ev.startDate) continue
    if (ev.isRecurrenceException()) exceptions.push(ev)
    else if (ev.uid && !masters.has(ev.uid)) masters.set(ev.uid, ev)
    else orphans.push(ev)
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid)
    if (master) master.relateException(ex)
    else orphans.push(ex)
  }

  const out: IcsEvent[] = []
  const push = (e: IcsEvent | null) => {
    if (e && out.length < MAX_EVENTS) out.push(e)
  }

  for (const ev of [...masters.values(), ...orphans]) {
    if (isCancelled(ev)) continue
    if (!ev.isRecurring()) {
      push(toEvent(ev, ev.startDate, ev.endDate, fromMs, toMs))
      continue
    }
    const it = ev.iterator()
    let next: Time | null
    let n = 0
    while ((next = it.next()) && n++ < MAX_ITERATIONS) {
      if (resolve(next, tzidOf(ev, 'dtstart')).approx - SLACK_MS >= toMs) break
      const d = ev.getOccurrenceDetails(next)
      if (isCancelled(d.item)) continue
      push(toEvent(d.item, d.startDate, d.endDate, fromMs, toMs))
    }
  }

  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
}

