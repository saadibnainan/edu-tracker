'use client'

import { useMemo, useState } from 'react'
import { Cell } from '@/components/ui/Cell'
import { PageHeader } from '@/components/ui/PageHeader'
import { SubjectSquare } from '@/components/ui/SubjectSquare'
import { dayKey, parseDayKey } from '@/lib/dates'
import { useData } from '@/lib/db/hooks'
import { newId, save, update } from '@/lib/db/store'
import { formatDuration, formatLongDate, formatTime } from '@/lib/format'
import type { Session, Subject } from '@/lib/types'
import { SessionForm } from './SessionForm'

const PAGE = 100
const KIND_LABEL: Record<Session['kind'], string> = { stopwatch: 'Stopwatch', countdown: 'Countdown', pomodoro: 'Pomodoro', manual: 'Manual' }

function matches(s: Session, subject: Subject | undefined, q: string): boolean {
  if (!q) return true
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const hay = [s.note ?? '', subject?.name ?? '', ...s.tags.map((t) => `#${t} ${t}`)].join(' ').toLowerCase()
  return terms.every((t) => hay.includes(t))
}

export function HistoryView() {
  const { ready, sessions, subjects } = useData()
  const [query, setQuery] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [added, setAdded] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const byId = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  const filtered = useMemo(
    () => sessions.filter((s) => !s.deleted_at && (!subjectFilter || s.subject_id === subjectFilter) && matches(s, byId.get(s.subject_id), query.trim())),
    [sessions, subjectFilter, query, byId],
  )
  const shown = filtered.slice(0, limit)
  const groups = useMemo(() => {
    const out: { key: string; items: Session[]; total: number }[] = []
    for (const s of shown) {
      const key = dayKey(new Date(s.started_at))
      let g = out.at(-1)
      if (!g || g.key !== key) out.push((g = { key, items: [], total: 0 }))
      g.items.push(s)
      g.total += s.duration_seconds
    }
    return out
  }, [shown])

  return (
    <>
      <PageHeader title="History" />
      <div className="grid grid-cols-12">
        <Cell index="01" title="Add session" className="col-span-12" aside={added ? <span className="label">Saved</span> : null}>
          {ready && subjects.filter((s) => !s.archived_at).length === 0 ? (
            <p className="text-muted">Add a subject first, then log forgotten sessions here.</p>
          ) : (
            <SessionForm
              key={`${ready ? 'ready' : 'loading'}-${formKey}`}
              subjects={subjects}
              submitLabel="Add session"
              onSubmit={async (v) => {
                setFormKey((k) => k + 1)
                await save('sessions', { id: newId(), kind: 'manual', deleted_at: null, ...v })
                setAdded(true)
                setTimeout(() => setAdded(false), 3000)
              }}
            />
          )}
        </Cell>

        <Cell index="02" title="Sessions" className="col-span-12" aside={<span className="label">{ready ? `${filtered.length} found` : ''}</span>}>
          <div className="grid gap-4 min-[600px]:grid-cols-[1fr_240px] mb-6">
            <label className="field">
              <span className="label">Search notes, tags, subjects</span>
              <input
                className="input"
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setLimit(PAGE)
                }}
                placeholder="eigenvalues, #exam"
              />
            </label>
            <label className="field">
              <span className="label">Subject</span>
              <select
                className="input"
                value={subjectFilter}
                onChange={(e) => {
                  setSubjectFilter(e.target.value)
                  setLimit(PAGE)
                }}
              >
                <option value="">All subjects</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!ready ? (
            <p className="label">Loading</p>
          ) : sessions.every((s) => s.deleted_at) ? (
            <p className="text-muted">No sessions yet. Start a timer to log one.</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted">No sessions match. Try another word or subject.</p>
          ) : (
            <div className="flex flex-col gap-6">
              {groups.map((g) => (
                <section key={g.key} aria-label={formatLongDate(parseDayKey(g.key))}>
                  <div className="flex justify-between label pb-2 border-b border-line">
                    <span>{formatLongDate(parseDayKey(g.key))}</span>
                    <span className="text-text">{formatDuration(g.total)}</span>
                  </div>
                  <ul>
                    {g.items.map((s) => {
                      const subject = byId.get(s.subject_id)
                      if (editing === s.id) {
                        return (
                          <li key={s.id} className="py-6 border-b border-line">
                            <SessionForm
                              subjects={subjects}
                              session={s}
                              submitLabel="Save"
                              onCancel={() => setEditing(null)}
                              onDelete={async () => {
                                await update('sessions', s.id, { deleted_at: new Date().toISOString() })
                                setEditing(null)
                              }}
                              onSubmit={async (v) => {
                                await update('sessions', s.id, v)
                                setEditing(null)
                              }}
                            />
                          </li>
                        )
                      }
                      return (
                        <li
                          key={s.id}
                          className="row-inv grid grid-cols-[88px_8px_1fr_auto_auto] min-[600px]:grid-cols-[112px_8px_1fr_96px_64px_auto] gap-x-4 gap-y-1 items-start py-2 px-4 min-[900px]:px-6 -mx-4 min-[900px]:-mx-6 border-b border-line"
                        >
                          <span className="num text-[13px]">
                            {formatTime(new Date(s.started_at))}-{formatTime(new Date(s.ended_at))}
                          </span>
                          <span className="pt-2">
                            <SubjectSquare color={subject?.color_index ?? 0} />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate">{subject?.name ?? 'Unknown subject'}</p>
                            {s.note && <p className="text-muted whitespace-pre-line break-words line-clamp-3">{s.note}</p>}
                            {s.tags.length > 0 && <p className="label normal-case! tracking-normal!">{s.tags.map((t) => `#${t}`).join(' ')}</p>}
                          </div>
                          <span className="label text-right max-[599px]:hidden pt-1">{KIND_LABEL[s.kind]}</span>
                          <span className="num text-right">{formatDuration(s.duration_seconds)}</span>
                          <button type="button" className="link-action pt-1" onClick={() => setEditing(s.id)} aria-label={`Edit session ${subject?.name ?? ''} ${formatTime(new Date(s.started_at))}`}>
                            Edit
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
              {filtered.length > limit && (
                <button type="button" className="btn self-start" onClick={() => setLimit((l) => l + PAGE)}>
                  Show {Math.min(PAGE, filtered.length - limit)} more
                </button>
              )}
            </div>
          )}
        </Cell>
      </div>
    </>
  )
}
