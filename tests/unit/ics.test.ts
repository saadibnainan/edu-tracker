import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { looksLikeIcs, parseIcs, wallClockToUtc } from '@/lib/ics/parse'
import { icsTimeToDate, normalizeIcsUrl } from '@/lib/ics/time'
import { isBlockedAddress } from '@/lib/ics/guard'

// TZ=Europe/Berlin (vitest.config.ts)
const text = readFileSync(new URL('../fixtures/timetable.ics', import.meta.url), 'utf8')
const week = (y: number, m: number, d: number) => ({ from: new Date(y, m - 1, d), to: new Date(y, m - 1, d + 7) })
const byUid = (events: ReturnType<typeof parseIcs>, uid: string) => events.filter((e) => e.uid === uid)

describe('parseIcs', () => {
  const { from, to } = week(2026, 9, 28)
  const events = parseIcs(text, from, to)

  it('expands a weekly RRULE and honours EXDATE', () => {
    const la = byUid(events, 'lecture-la@test')
    expect(la.map((e) => e.start)).toEqual(['2026-09-28T08:00:00.000Z'])
    expect(la[0]).toMatchObject({ summary: 'Linear Algebra lecture', location: 'Room H 1', end: '2026-09-28T09:30:00.000Z', allDay: false })
  })

  it('keeps all-day events as dates with an exclusive end', () => {
    expect(byUid(events, 'holiday@test')).toEqual([
      { uid: 'holiday@test', summary: 'Unity Day', location: null, start: '2026-10-03', end: '2026-10-04', allDay: true },
    ])
  })

  it('passes UTC times through', () => {
    expect(byUid(events, 'utc@test')[0]?.start).toBe('2026-10-01T08:00:00.000Z')
  })

  it('returns floating times as wall clock for the viewer to place', () => {
    expect(byUid(events, 'floating@test')[0]).toMatchObject({ start: '2026-10-02T09:00:00', end: '2026-10-02T10:00:00' })
  })

  it('resolves an IANA TZID that has no VTIMEZONE block', () => {
    expect(byUid(events, 'iana-no-vtimezone@test')[0]?.start).toBe('2026-10-01T13:00:00.000Z')
  })

  it('drops cancelled events', () => {
    expect(byUid(events, 'cancelled@test')).toHaveLength(0)
  })

  it('excludes occurrences outside the window', () => {
    expect(byUid(events, 'dst@test')).toHaveLength(0)
  })

  it('applies RECURRENCE-ID overrides', () => {
    const next = parseIcs(text, week(2026, 10, 5).from, week(2026, 10, 5).to)
    const la = byUid(next, 'lecture-la@test')
    expect(la.map((e) => [e.start, e.summary])).toEqual([
      ['2026-10-05T12:00:00.000Z', 'Linear Algebra lecture (moved)'],
      ['2026-10-07T08:00:00.000Z', 'Linear Algebra lecture'],
    ])
  })

  it('keeps local wall-clock time across the DST change', () => {
    const before = byUid(parseIcs(text, week(2026, 10, 19).from, week(2026, 10, 19).to), 'dst@test')
    const after = byUid(parseIcs(text, week(2026, 10, 26).from, week(2026, 10, 26).to), 'dst@test')
    expect(before[0]?.start).toBe('2026-10-19T07:00:00.000Z')
    expect(after[0]?.start).toBe('2026-10-26T08:00:00.000Z')
    expect(icsTimeToDate(after[0]!.start).getHours()).toBe(9)
  })

  it('rejects non-calendar input', () => {
    expect(looksLikeIcs('<html>nope</html>')).toBe(false)
    expect(() => parseIcs('<html>nope</html>', from, to)).toThrow()
  })

  it('accepts a BOM and leading whitespace', () => {
    expect(looksLikeIcs('﻿\r\nBEGIN:VCALENDAR')).toBe(true)
  })
})

describe('time helpers', () => {
  it('converts wall clock in a zone to UTC on both sides of DST', () => {
    const t = { year: 2026, month: 10, day: 24, hour: 9, minute: 0, second: 0 }
    expect(new Date(wallClockToUtc(t, 'Europe/Berlin')).toISOString()).toBe('2026-10-24T07:00:00.000Z')
    expect(new Date(wallClockToUtc({ ...t, day: 26 }, 'Europe/Berlin')).toISOString()).toBe('2026-10-26T08:00:00.000Z')
  })

  it('reads floating and date values as local time', () => {
    expect(icsTimeToDate('2026-10-02T09:00:00').getHours()).toBe(9)
    expect(icsTimeToDate('2026-10-03').getDate()).toBe(3)
  })

  it('normalizes webcal and rejects non-https links', () => {
    expect(normalizeIcsUrl('webcal://example.com/a.ics')).toBe('https://example.com/a.ics')
    expect(normalizeIcsUrl('http://example.com/a.ics')).toBeNull()
    expect(normalizeIcsUrl('https://user:pw@example.com/a.ics')).toBeNull()
    expect(normalizeIcsUrl('not a url')).toBeNull()
  })
})

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '::1', '::', 'fe80::1', 'fd00::1', 'fc00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::a9fe:a9fe', 'ff02::1', 'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true)
  })

  it.each(['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false)
  })
})
