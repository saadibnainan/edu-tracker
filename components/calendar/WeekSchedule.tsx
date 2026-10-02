'use client'

import { addDays, dayKey, startOfDay } from '@/lib/dates'
import { formatTime, weekdayShort } from '@/lib/format'
import type { WeekEvent } from './useWeekEvents'

function timeRange(e: WeekEvent, day: Date): string {
  if (e.allDay) return 'All day'
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  const s = e.startDate < dayStart ? '00:00' : formatTime(e.startDate)
  const t = e.endDate > dayEnd ? '24:00' : formatTime(e.endDate)
  return `${s}-${t}`
}

/** Seven columns on wide screens, a day list on narrow ones. */
export function WeekSchedule({ events, weekStart, today }: { events: WeekEvent[]; weekStart: Date; today: Date }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const todayKey = dayKey(today)

  return (
    <ol className="grid grid-cols-1 min-[1400px]:grid-cols-7 border-t border-l border-line">
      {days.map((d) => {
        const from = startOfDay(d)
        const to = addDays(from, 1)
        const list = events
          .filter((e) => e.startDate < to && e.endDate > from)
          .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startDate.getTime() - b.startDate.getTime())
        const isToday = dayKey(d) === todayKey
        return (
          <li key={dayKey(d)} className="relative border-r border-b border-line min-w-0 min-[1400px]:min-h-[160px]">
            <div className={`label px-4 py-2 border-b border-line flex justify-between ${isToday ? 'text-text!' : ''}`}>
              {isToday && <span className="absolute left-0 right-0 top-0 h-[2px] bg-accent" aria-hidden="true" />}
              <span>
                {weekdayShort(d)} {String(d.getDate()).padStart(2, '0')}
              </span>
              {isToday && <span className="min-[1400px]:sr-only">Today</span>}
            </div>
            {list.length === 0 ? (
              <p className="label px-4 py-2 text-disabled!">-</p>
            ) : (
              <ul>
                {list.map((e) => (
                  <li key={`${e.sourceId}-${e.uid}-${e.start}`} className="px-4 py-2 border-b border-line last:border-b-0">
                    <p className="num text-[11px] leading-4 text-muted">{timeRange(e, d)}</p>
                    <p className="leading-5 break-words">{e.summary}</p>
                    {e.location && <p className="label normal-case! tracking-normal! break-words">{e.location}</p>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ol>
  )
}
