'use client'

import Link from 'next/link'
import { Cell } from '@/components/ui/Cell'
import { SubjectSquare } from '@/components/ui/SubjectSquare'
import { useNow } from '@/components/ui/useNow'
import { daysBetween, parseDayKey } from '@/lib/dates'
import { useData } from '@/lib/db/hooks'
import { formatShortDate } from '@/lib/format'

export function countdownText(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `${days} days`
}

export function ExamsCell() {
  const { ready, exams, subjects } = useData()
  const now = useNow()
  const today = now ? new Date(now) : null
  const upcoming = today
    ? exams
        .filter((e) => !e.deleted_at)
        .map((e) => ({ e, days: daysBetween(today, parseDayKey(e.exam_date)) }))
        .filter((x) => x.days >= 0)
        .slice(0, 6)
    : []

  return (
    <Cell
      index="03"
      title="Exams"
      className="col-span-12 min-[600px]:col-span-6 min-[1200px]:col-span-4 min-[1200px]:order-2"
      aside={
        <Link href="/calendar#exams" className="link-action">
          Manage
        </Link>
      }
    >
      {!ready || !today ? (
        <p className="label">Loading</p>
      ) : upcoming.length === 0 ? (
        <p className="text-muted">No upcoming exams. Add one on the Calendar page.</p>
      ) : (
        <ul className="border-t border-line">
          {upcoming.map(({ e, days }) => {
            const subject = subjects.find((s) => s.id === e.subject_id)
            return (
              <li key={e.id} className="grid grid-cols-[8px_1fr_auto] gap-x-4 items-center py-2 border-b border-line">
                <SubjectSquare color={subject?.color_index ?? 0} />
                <div className="min-w-0">
                  <p className="truncate">{e.title || subject?.name || 'Exam'}</p>
                  <p className="label">
                    {e.title && subject ? `${subject.name}, ` : ''}
                    {formatShortDate(parseDayKey(e.exam_date))}
                  </p>
                </div>
                <span className={`num text-right ${days <= 7 ? 'text-text' : 'text-muted'}`}>{countdownText(days)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Cell>
  )
}
