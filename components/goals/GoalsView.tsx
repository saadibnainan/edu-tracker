'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Cell } from '@/components/ui/Cell'
import { PageHeader } from '@/components/ui/PageHeader'
import { Progress } from '@/components/ui/Progress'
import { SubjectSquare } from '@/components/ui/SubjectSquare'
import { useNow } from '@/components/ui/useNow'
import { useData } from '@/lib/db/hooks'
import { save, update } from '@/lib/db/store'
import { formatDuration, parseHoursInput } from '@/lib/format'
import { findGoal } from '@/lib/goals'
import { goalKey, stableUuid } from '@/lib/ids'
import { dayTotals, periodTotal } from '@/lib/stats/stats'
import type { Goal, GoalPeriod } from '@/lib/types'

export function GoalsView() {
  const { ready, userId, goals, subjects, sessions } = useData()
  const now = useNow()
  const [scope, setScope] = useState('')
  const [period, setPeriod] = useState<GoalPeriod>('daily')
  const [target, setTarget] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const totals = useMemo(() => dayTotals(sessions), [sessions])
  const live = goals.filter((g) => !g.deleted_at)
  const active = subjects.filter((s) => !s.archived_at)
  const existing = findGoal(goals, period, scope || null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    const minutes = parseHoursInput(target)
    const max = period === 'daily' ? 24 * 60 : 168 * 60
    if (minutes === null || minutes < 1 || minutes > max) return setError(period === 'daily' ? 'Daily goal must be between 0:01 and 24 hours.' : 'Weekly goal must be between 0:01 and 168 hours.')
    setError(null)
    // Clear first: anything typed while the write is in flight must not be wiped.
    setTarget('')
    const id = await stableUuid(goalKey(userId, scope || null, period))
    await save('goals', { id, subject_id: scope || null, period, target_minutes: minutes, deleted_at: null })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function progress(g: Goal): number {
    if (!now) return 0
    const days = g.subject_id ? totals.bySubject.get(g.subject_id) : totals.all
    return periodTotal(days, g.period === 'daily' ? 'today' : 'week', new Date(now))
  }

  const sorted = [...live].sort((a, b) => Number(a.subject_id !== null) - Number(b.subject_id !== null) || (a.period < b.period ? -1 : 1))
  const withTargets = active.filter((s) => s.weekly_target_minutes)

  return (
    <>
      <PageHeader title="Goals" />
      <div className="grid grid-cols-12">
        <Cell index="01" title="Set goal" className="col-span-12 min-[1200px]:col-span-5" aside={saved ? <span className="label">Saved</span> : null}>
          <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
            <div className="seg" role="group" aria-label="Period">
              {(['daily', 'weekly'] as const).map((p) => (
                <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>
                  {p === 'daily' ? 'Daily' : 'Weekly'}
                </button>
              ))}
            </div>
            <div className="grid gap-4 min-[600px]:grid-cols-[1fr_160px]">
              <label className="field">
                <span className="label">Applies to</span>
                <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="">All subjects</option>
                  {active.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">Target, hours</span>
                <input
                  className="input mono"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={existing ? formatDuration(existing.target_minutes * 60) : period === 'daily' ? '2' : '12:30'}
                  inputMode="decimal"
                />
              </label>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button className="btn btn-primary" type="submit" disabled={!ready}>
                {existing ? 'Update goal' : 'Set goal'}
              </button>
              {error && (
                <p className="msg msg-error ml-2" role="alert">
                  {error}
                </p>
              )}
            </div>
          </form>
        </Cell>

        <Cell index="02" title="Goals" className="col-span-12 min-[1200px]:col-span-7">
          {!ready || !now ? (
            <p className="label">Loading</p>
          ) : sorted.length === 0 ? (
            <p className="text-muted">No goals yet. Set a daily or weekly target to track progress.</p>
          ) : (
            <ul className="border-t border-line">
              {sorted.map((g) => {
                const subject = subjects.find((s) => s.id === g.subject_id)
                const done = progress(g)
                return (
                  <li key={g.id} className="py-4 border-b border-line flex flex-col gap-2">
                    <div className="flex items-center gap-4">
                      {subject ? <SubjectSquare color={subject.color_index} dim={Boolean(subject.archived_at)} /> : <i className="sq border border-muted" aria-hidden="true" />}
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{subject?.name ?? 'All subjects'}</p>
                        <p className="label min-[600px]:hidden">{g.period === 'daily' ? 'Today' : 'This week'}</p>
                      </div>
                      <span className="label max-[599px]:hidden">{g.period === 'daily' ? 'Today' : 'This week'}</span>
                      <span className="num">
                        {formatDuration(done)} / {formatDuration(g.target_minutes * 60)}
                      </span>
                      <button type="button" className="link-action" onClick={() => void update('goals', g.id, { deleted_at: new Date().toISOString() })}>
                        Remove
                      </button>
                    </div>
                    <Progress value={done} max={g.target_minutes * 60} label={`${subject?.name ?? 'All subjects'} ${g.period} goal`} />
                  </li>
                )
              })}
            </ul>
          )}
        </Cell>

        <Cell index="03" title="Subject weekly targets" className="col-span-12" aside={<Link href="/subjects" className="link-action">Edit in subjects</Link>}>
          {!ready || !now ? (
            <p className="label">Loading</p>
          ) : withTargets.length === 0 ? (
            <p className="text-muted">No subject has a weekly target. Add one when you create or edit a subject.</p>
          ) : (
            <ul className="border-t border-line grid min-[900px]:grid-cols-2 min-[900px]:gap-x-8">
              {withTargets.map((s) => {
                const done = periodTotal(totals.bySubject.get(s.id), 'week', new Date(now))
                return (
                  <li key={s.id} className="py-4 border-b border-line flex flex-col gap-2">
                    <div className="flex items-center gap-4">
                      <SubjectSquare color={s.color_index} />
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="num">
                        {formatDuration(done)} / {formatDuration((s.weekly_target_minutes ?? 0) * 60)}
                      </span>
                    </div>
                    <Progress value={done} max={(s.weekly_target_minutes ?? 0) * 60} label={`${s.name} weekly target`} />
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
