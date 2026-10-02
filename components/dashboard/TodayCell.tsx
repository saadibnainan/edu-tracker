'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useTimer } from '@/components/timer/TimerProvider'
import { Cell } from '@/components/ui/Cell'
import { Progress } from '@/components/ui/Progress'
import { useData } from '@/lib/db/hooks'
import { formatDuration } from '@/lib/format'
import { findGoal } from '@/lib/goals'
import { dayTotals, periodTotal, streak } from '@/lib/stats/stats'

export function TodayCell() {
  const { ready, sessions, goals } = useData()
  const { now, state, elapsed } = useTimer()
  const totals = useMemo(() => dayTotals(sessions), [sessions])
  const date = new Date(now)
  // The run in progress counts too, so this cell agrees with the timer's Today figure.
  const studying = state.status !== 'idle' && !(state.mode === 'pomodoro' && state.phase !== 'focus')
  const live = studying ? Math.floor(elapsed / 1000) : 0
  const today = periodTotal(totals.all, 'today', date) + live
  const week = periodTotal(totals.all, 'week', date) + live
  const days = streak(totals.all, date)
  const daily = findGoal(goals, 'daily', null)
  const weekly = findGoal(goals, 'weekly', null)

  function block(label: string, seconds: number, goalMinutes: number | undefined, goalText: string) {
    return (
      <div>
        <p className="label">{label}</p>
        <p className="font-mono tabular-nums text-[32px] leading-10 font-medium mt-2 mb-2" suppressHydrationWarning>
          {formatDuration(seconds)}
        </p>
        {goalMinutes ? (
          <>
            <Progress value={seconds} max={goalMinutes * 60} label={`${label} goal progress`} />
            <p className="label mt-2">
              {Math.min(999, Math.round((seconds / (goalMinutes * 60)) * 100))}% of {formatDuration(goalMinutes * 60)} {goalText}
            </p>
          </>
        ) : (
          <p className="label">
            No {goalText}.{' '}
            <Link href="/goals" className="underline underline-offset-4 hover:text-text">
              Set one
            </Link>
          </p>
        )}
      </div>
    )
  }

  return (
    <Cell index="02" title="Today" className="col-span-12 min-[600px]:col-span-6 min-[1200px]:col-span-4" aside={<span className="label">{ready ? `Streak ${days} ${days === 1 ? 'day' : 'days'}` : ''}</span>}>
      <div className="flex flex-col gap-6">
        {block('Today', today, daily?.target_minutes, 'daily goal')}
        {block('This week', week, weekly?.target_minutes, 'weekly goal')}
      </div>
    </Cell>
  )
}
