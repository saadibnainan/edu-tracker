'use client'

import { useMemo, useState } from 'react'
import { countdownText } from '@/components/dashboard/ExamsCell'
import { Cell } from '@/components/ui/Cell'
import { PageHeader } from '@/components/ui/PageHeader'
import { SubjectSquare } from '@/components/ui/SubjectSquare'
import { useNow } from '@/components/ui/useNow'
import { addDays, dayKey, daysBetween, parseDayKey, startOfWeek } from '@/lib/dates'
import { useData } from '@/lib/db/hooks'
import { newId, save, update } from '@/lib/db/store'
import { formatShortDate } from '@/lib/format'
import { normalizeIcsUrl } from '@/lib/ics/time'
import { useWeekEvents } from './useWeekEvents'
import { WeekSchedule } from './WeekSchedule'

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function CalendarView() {
  const { ready, calendar_sources, exams, subjects } = useData()
  const now = useNow()
  const weekStart = useMemo(() => startOfWeek(new Date(now ?? 0)), [now])
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart])
  const sources = calendar_sources.filter((s) => !s.deleted_at)
  const week = useWeekEvents(sources, weekStart, weekEnd)

  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)

  const active = subjects.filter((s) => !s.archived_at)
  const [examSubject, setExamSubject] = useState('')
  const [examDate, setExamDate] = useState('')
  const [examTitle, setExamTitle] = useState('')
  const [examError, setExamError] = useState<string | null>(null)

  async function addSource(e: React.FormEvent) {
    e.preventDefault()
    const normalized = normalizeIcsUrl(url)
    if (!normalized) return setUrlError('Paste an https:// or webcal:// link to an .ics calendar.')
    if (sources.some((s) => s.url === normalized)) return setUrlError('That calendar is already added.')
    setUrlError(null)
    setUrl('')
    setLabel('')
    await save('calendar_sources', { id: newId(), url: normalized, label: label.trim() || null, deleted_at: null })
  }

  async function addExam(e: React.FormEvent) {
    e.preventDefault()
    const subjectId = examSubject || active[0]?.id
    if (!subjectId) return setExamError('Add a subject first.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return setExamError('Pick a date.')
    setExamError(null)
    const title = examTitle.trim() || null
    setExamDate('')
    setExamTitle('')
    await save('exams', { id: newId(), subject_id: subjectId, exam_date: examDate, title, deleted_at: null })
  }

  const today = now ? new Date(now) : null
  const liveExams = exams.filter((x) => !x.deleted_at)
  const upcoming = today ? liveExams.filter((x) => x.exam_date >= dayKey(today)) : []
  const past = today ? liveExams.filter((x) => x.exam_date < dayKey(today)).reverse() : []

  return (
    <>
      <PageHeader title="Calendar" />
      <div className="grid grid-cols-12">
        <Cell index="01" title="Calendars" className="col-span-12 min-[1200px]:col-span-6">
          <form onSubmit={addSource} className="flex flex-col gap-4 mb-6" noValidate>
            <div className="grid gap-4 min-[600px]:grid-cols-[2fr_1fr]">
              <label className="field">
                <span className="label">.ics subscription link</span>
                <input
                  className="input mono"
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://.../timetable.ics"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                <span className="label">Name</span>
                <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Optional" maxLength={80} />
              </label>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button className="btn btn-primary" type="submit" disabled={!ready || !url.trim()}>
                Add calendar
              </button>
              {urlError && (
                <p className="msg msg-error ml-2" role="alert">
                  {urlError}
                </p>
              )}
            </div>
            <p className="label normal-case! tracking-normal!">The link is fetched by the server and stays private to your account. Treat it like a password.</p>
          </form>
          {sources.length === 0 ? (
            <p className="text-muted">No calendars yet.</p>
          ) : (
            <ul className="border-t border-line">
              {sources.map((s) => (
                <li key={s.id} className="row-inv flex items-center gap-4 min-h-12 py-2 px-4 min-[900px]:px-6 -mx-4 min-[900px]:-mx-6 border-b border-line">
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{s.label || hostOf(s.url)}</p>
                    {week.errors[s.id] ? <p className="msg msg-error">{week.errors[s.id]}</p> : <p className="label truncate">{hostOf(s.url)}</p>}
                  </div>
                  <button type="button" className="link-action" onClick={() => void update('calendar_sources', s.id, { deleted_at: new Date().toISOString() })}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Cell>

        <Cell index="02" title="Exams" id="exams" className="col-span-12 min-[1200px]:col-span-6">
          {ready && active.length === 0 ? (
            <p className="text-muted mb-6">Add a subject first, then add its exam dates here.</p>
          ) : (
            <form onSubmit={addExam} className="flex flex-col gap-4 mb-6" noValidate>
              <div className="grid gap-4 min-[600px]:grid-cols-3">
                <label className="field">
                  <span className="label">Subject</span>
                  <select className="input" value={examSubject || active[0]?.id || ''} onChange={(e) => setExamSubject(e.target.value)}>
                    {active.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="label">Date</span>
                  <input className="input mono" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
                </label>
                <label className="field">
                  <span className="label">Title</span>
                  <input className="input" value={examTitle} onChange={(e) => setExamTitle(e.target.value)} placeholder="Optional" maxLength={120} />
                </label>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button className="btn btn-primary" type="submit" disabled={!ready}>
                  Add exam
                </button>
                {examError && (
                  <p className="msg msg-error ml-2" role="alert">
                    {examError}
                  </p>
                )}
              </div>
            </form>
          )}
          {today && liveExams.length === 0 ? (
            <p className="text-muted">No exams yet.</p>
          ) : (
            today && (
              <ul className="border-t border-line">
                {[...upcoming, ...past].map((x) => {
                  const subject = subjects.find((s) => s.id === x.subject_id)
                  const days = daysBetween(today, parseDayKey(x.exam_date))
                  const isPast = days < 0
                  return (
                    <li key={x.id} className={`row-inv ${isPast ? 'is-off' : ''} grid grid-cols-[8px_1fr_auto_auto] gap-4 items-center min-h-12 py-2 px-4 min-[900px]:px-6 -mx-4 min-[900px]:-mx-6 border-b border-line`}>
                      <SubjectSquare color={subject?.color_index ?? 0} dim={isPast} />
                      <div className="min-w-0">
                        <p className="truncate">{x.title || subject?.name || 'Exam'}</p>
                        <p className="label">
                          {x.title && subject ? `${subject.name}, ` : ''}
                          {formatShortDate(parseDayKey(x.exam_date))}
                        </p>
                      </div>
                      <span className="num">{isPast ? 'Done' : countdownText(days)}</span>
                      <button type="button" className="link-action" onClick={() => void update('exams', x.id, { deleted_at: new Date().toISOString() })}>
                        Remove
                      </button>
                    </li>
                  )
                })}
              </ul>
            )
          )}
        </Cell>

        <Cell
          index="03"
          title="This week"
          className="col-span-12"
          aside={<span className="label">{week.loading ? 'Loading' : week.cached ? 'Offline copy' : ''}</span>}
        >
          {!ready || !today ? (
            <p className="label">Loading</p>
          ) : sources.length === 0 ? (
            <p className="text-muted">Add a calendar link to see this week&apos;s schedule.</p>
          ) : (
            <WeekSchedule events={week.events} weekStart={weekStart} today={today} />
          )}
        </Cell>
      </div>
    </>
  )
}
