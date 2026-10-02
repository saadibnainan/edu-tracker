'use client'

import { useMemo, useState } from 'react'
import { Cell } from '@/components/ui/Cell'
import { PageHeader } from '@/components/ui/PageHeader'
import { SubjectSquare } from '@/components/ui/SubjectSquare'
import { useNow } from '@/components/ui/useNow'
import { useData } from '@/lib/db/hooks'
import { newId, save, update } from '@/lib/db/store'
import { formatDuration } from '@/lib/format'
import { dayTotals, periodTotal } from '@/lib/stats/stats'
import type { Subject } from '@/lib/types'
import { SubjectForm } from './SubjectForm'

export function SubjectsView() {
  const { ready, subjects, sessions } = useData()
  const now = useNow()
  const [editing, setEditing] = useState<string | null>(null)
  const totals = useMemo(() => dayTotals(sessions), [sessions])
  const active = subjects.filter((s) => !s.archived_at)
  const archived = subjects.filter((s) => s.archived_at)

  const week = (id: string) => (now ? periodTotal(totals.bySubject.get(id), 'week', new Date(now)) : 0)

  function row(s: Subject) {
    if (editing === s.id) {
      return (
        <li key={s.id} className="border-b border-line py-6">
          <SubjectForm
            initial={s}
            submitLabel="Save"
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              await update('subjects', s.id, v)
              setEditing(null)
            }}
          />
        </li>
      )
    }
    const off = Boolean(s.archived_at)
    return (
      <li
        key={s.id}
        className={`row-inv ${off ? 'is-off' : ''} grid grid-cols-[8px_1fr_auto_auto] min-[600px]:grid-cols-[8px_1fr_72px_72px_auto] gap-4 items-center min-h-12 py-2 px-4 min-[900px]:px-6 -mx-4 min-[900px]:-mx-6 border-b border-line`}
      >
        <SubjectSquare color={s.color_index} dim={off} />
        <span className="truncate">{s.name}</span>
        <span className="num text-right">{formatDuration(week(s.id))}</span>
        <span className="num text-right max-[599px]:hidden">{s.weekly_target_minutes ? formatDuration(s.weekly_target_minutes * 60) : '-'}</span>
        <span className="flex gap-4 justify-end">
          {!off && (
            <button type="button" className="link-action" onClick={() => setEditing(s.id)} aria-label={`Edit ${s.name}`}>
              Edit
            </button>
          )}
          <button
            type="button"
            className="link-action"
            onClick={() => void update('subjects', s.id, { archived_at: off ? null : new Date().toISOString() })}
            aria-label={`${off ? 'Restore' : 'Archive'} ${s.name}`}
          >
            {off ? 'Restore' : 'Archive'}
          </button>
        </span>
      </li>
    )
  }

  const head = (
    <div className="label grid grid-cols-[8px_1fr_auto_auto] min-[600px]:grid-cols-[8px_1fr_72px_72px_auto] gap-4 pb-2 border-b border-line">
      <i />
      <span>Name</span>
      <span className="text-right">Week</span>
      <span className="text-right max-[599px]:hidden">Target</span>
      <span className="text-right w-[112px]" />
    </div>
  )

  return (
    <>
      <PageHeader title="Subjects" />
      <div className="grid grid-cols-12">
        <Cell index="01" title="New subject" className="col-span-12 min-[1200px]:col-span-5">
          <SubjectForm submitLabel="Add subject" onSubmit={(v) => save('subjects', { id: newId(), archived_at: null, ...v }).then(() => {})} />
        </Cell>
        <Cell
          index="02"
          title="Subjects"
          className="col-span-12 min-[1200px]:col-span-7"
          aside={<span className="label">{ready ? `${active.length} active / ${archived.length} archived` : ''}</span>}
        >
          {!ready ? (
            <p className="label">Loading</p>
          ) : active.length === 0 ? (
            <p className="text-muted">No subjects yet. Add one to start timing.</p>
          ) : (
            <>
              {head}
              <ul>{active.map(row)}</ul>
            </>
          )}
        </Cell>
        {archived.length > 0 && (
          <Cell index="03" title="Archived" className="col-span-12">
            <p className="text-muted mb-4">Archived subjects keep their sessions. Restore one to time it again.</p>
            <ul className="border-t border-line">{archived.map(row)}</ul>
          </Cell>
        )}
      </div>
    </>
  )
}
