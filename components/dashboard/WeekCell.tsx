'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useWeekEvents } from '@/components/calendar/useWeekEvents'
import { WeekSchedule } from '@/components/calendar/WeekSchedule'
import { Cell } from '@/components/ui/Cell'
import { useNow } from '@/components/ui/useNow'
import { addDays, startOfWeek } from '@/lib/dates'
import { useData } from '@/lib/db/hooks'

export function WeekCell() {
  const { ready, calendar_sources } = useData()
  const now = useNow()
  const weekStart = useMemo(() => startOfWeek(new Date(now ?? 0)), [now])
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart])
  const sources = calendar_sources.filter((s) => !s.deleted_at)
  const { events, loading, errors, cached } = useWeekEvents(sources, weekStart, weekEnd)
  const errorCount = Object.keys(errors).length

  return (
    <Cell
      index="04"
      title="This week"
      className="col-span-12 min-[1200px]:col-span-8 min-[1200px]:order-1"
      aside={
        <span className="label">
          {loading ? 'Loading' : errorCount ? `${errorCount} ${errorCount === 1 ? 'calendar' : 'calendars'} failed` : cached ? 'Offline copy' : ''}
        </span>
      }
    >
      {!ready || now === null ? (
        <p className="label">Loading</p>
      ) : sources.length === 0 ? (
        <p className="text-muted">
          No calendar connected.{' '}
          <Link href="/calendar" className="underline underline-offset-4 text-text">
            Paste an .ics link
          </Link>{' '}
          to see your timetable here.
        </p>
      ) : (
        <WeekSchedule events={events} weekStart={weekStart} today={new Date(now)} />
      )}
    </Cell>
  )
}
