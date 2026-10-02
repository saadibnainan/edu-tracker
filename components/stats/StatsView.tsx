'use client'

import { useMemo, useState } from 'react'
import { Cell } from '@/components/ui/Cell'
import { PageHeader } from '@/components/ui/PageHeader'
import { Progress } from '@/components/ui/Progress'
import { SubjectSquare } from '@/components/ui/SubjectSquare'
import { useNow } from '@/components/ui/useNow'
import { useData } from '@/lib/db/hooks'
import { formatDuration, formatShortDate } from '@/lib/format'
import { dailySeries, dayTotals, periodTotal, streak, STREAK_THRESHOLD_SECONDS, type Period } from '@/lib/stats/stats'
import { DailyChart, type ChartDay } from './DailyChart'

const CHART_DAYS = 30

export function StatsView() {
  const { ready, sessions, subjects } = useData()
  const now = useNow()
  const [period, setPeriod] = useState<Exclude<Period, 'today'>>('week')
  const totals = useMemo(() => dayTotals(sessions), [sessions])
  const date = useMemo(() => (now ? new Date(now) : null), [now])

  const chartDays = useMemo<ChartDay[]>(() => {
    if (!date) return []
    return dailySeries(totals.all, date, CHART_DAYS).map((d, i, all) => ({
      label: String(d.date.getDate()).padStart(2, '0'),
      title: formatShortDate(d.date),
      seconds: d.seconds,
      current: i === all.length - 1,
    }))
  }, [totals, date])

  const breakdown = useMemo(() => {
    if (!date) return []
    return subjects
      .map((s) => ({ s, seconds: periodTotal(totals.bySubject.get(s.id), period, date) }))
      .filter((x) => x.seconds > 0 || !x.s.archived_at)
      .sort((a, b) => b.seconds - a.seconds)
  }, [subjects, totals, period, date])
  const periodSum = breakdown.reduce((a, b) => a + b.seconds, 0)
  const chartTotal = chartDays.reduce((a, d) => a + d.seconds, 0)

  if (!ready || !date) {
    return (
      <>
        <PageHeader title="Stats" />
        <div className="cell">
          <p className="label">Loading</p>
        </div>
      </>
    )
  }

  const days = streak(totals.all, date)
  const figures: [string, number | string][] = [
    ['Today', formatDuration(periodTotal(totals.all, 'today', date))],
    ['This week', formatDuration(periodTotal(totals.all, 'week', date))],
    ['This month', formatDuration(periodTotal(totals.all, 'month', date))],
    ['Streak', `${days} ${days === 1 ? 'day' : 'days'}`],
  ]

  return (
    <>
      <PageHeader title="Stats" />
      <div className="grid grid-cols-12">
        <Cell index="01" title="Totals" className="col-span-12">
          <dl className="grid grid-cols-2 min-[900px]:grid-cols-4 border-t border-l border-line">
            {figures.map(([label, value]) => (
              <div key={label} className="border-r border-b border-line p-4">
                <dt className="label">{label}</dt>
                <dd className="font-mono tabular-nums text-[32px] leading-10 font-medium mt-2">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="label mt-4">A streak day needs at least {STREAK_THRESHOLD_SECONDS / 60} minutes.</p>
        </Cell>

        <Cell index="02" title={`Last ${CHART_DAYS} days`} className="col-span-12" aside={<span className="label">Total {formatDuration(chartTotal)}</span>}>
          <DailyChart days={chartDays} ariaLabel={`Daily study hours for the last ${CHART_DAYS} days, ${formatDuration(chartTotal)} in total.`} />
          <table className="sr-only">
            <caption>Daily study time</caption>
            <tbody>
              {chartDays.map((d) => (
                <tr key={d.title}>
                  <th scope="row">{d.title}</th>
                  <td>{formatDuration(d.seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cell>

        <Cell
          index="03"
          title="By subject"
          className="col-span-12"
          aside={
            <div className="seg" role="group" aria-label="Period">
              {(['week', 'month'] as const).map((p) => (
                <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className="h-8! px-2!">
                  {p === 'week' ? 'Week' : 'Month'}
                </button>
              ))}
            </div>
          }
        >
          {breakdown.length === 0 ? (
            <p className="text-muted">No subjects yet.</p>
          ) : (
            <ul className="border-t border-line">
              {breakdown.map(({ s, seconds }) => {
                const share = periodSum ? Math.round((seconds / periodSum) * 100) : 0
                const target = period === 'week' && s.weekly_target_minutes ? s.weekly_target_minutes * 60 : null
                return (
                  <li key={s.id} className="py-4 border-b border-line grid grid-cols-[8px_1fr_auto_auto] gap-x-4 gap-y-2 items-center">
                    <SubjectSquare color={s.color_index} dim={Boolean(s.archived_at)} />
                    <span className="truncate">{s.name}</span>
                    <span className="label">{target ? `${Math.round((seconds / target) * 100)}% of target` : `${share}% of total`}</span>
                    <span className="num w-16 text-right">{formatDuration(seconds)}</span>
                    <div className="col-start-2 col-span-3">
                      <Progress value={target ? seconds : share} max={target ?? 100} label={`${s.name} ${target ? 'weekly target' : 'share'}`} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Cell>
      </div>
    </>
  )
}
