'use client'

import { useState } from 'react'
import { fromDateTimeLocal, toDateTimeLocal } from '@/lib/dates'
import { parseTags } from '@/lib/format'
import type { Session, Subject } from '@/lib/types'

export interface SessionFormValue {
  subject_id: string
  started_at: string
  ended_at: string
  duration_seconds: number
  note: string | null
  tags: string[]
}

const MAX_SECONDS = 24 * 3600

/**
 * Manual entry (no `session`) or edit. Duration defaults to end minus start;
 * when editing a timed session it keeps its pause-excluding duration unless
 * the user changes it.
 */
export function SessionForm({
  subjects,
  session,
  defaultSubjectId,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
}: {
  subjects: Subject[]
  session?: Session
  defaultSubjectId?: string
  submitLabel: string
  onSubmit: (v: SessionFormValue) => void | Promise<void>
  onCancel?: () => void
  onDelete?: () => void
}) {
  const now = new Date()
  const initialStart = session ? new Date(session.started_at) : new Date(now.getTime() - 3600_000)
  const initialEnd = session ? new Date(session.ended_at) : now
  const usable = subjects.filter((s) => !s.archived_at || s.id === session?.subject_id)

  const [subjectId, setSubjectId] = useState(session?.subject_id ?? defaultSubjectId ?? usable[0]?.id ?? '')
  const [start, setStart] = useState(toDateTimeLocal(initialStart))
  const [end, setEnd] = useState(toDateTimeLocal(initialEnd))
  const [minutes, setMinutes] = useState(session ? String(Math.round(session.duration_seconds / 60)) : '')
  const [note, setNote] = useState(session?.note ?? '')
  const [tags, setTags] = useState(session?.tags.join(', ') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const s = fromDateTimeLocal(start)
    const t = fromDateTimeLocal(end)
    if (!subjectId) return setError('Pick a subject.')
    if (!s || !t) return setError('Enter a start and end time.')
    if (t <= s) return setError('End must be after start.')
    if (t.getTime() > Date.now() + 60_000) return setError('End cannot be in the future.')
    const span = Math.round((t.getTime() - s.getTime()) / 1000)
    if (span > MAX_SECONDS) return setError('A session can be at most 24 hours.')
    let duration = span
    if (minutes.trim()) {
      const m = Number(minutes)
      if (!Number.isFinite(m) || m < 1) return setError('Duration must be at least 1 minute.')
      duration = Math.round(m * 60)
      if (duration > span) return setError('Duration cannot be longer than start to end.')
    }
    setError(null)
    await onSubmit({
      subject_id: subjectId,
      started_at: s.toISOString(),
      ended_at: t.toISOString(),
      duration_seconds: duration,
      note: note.trim() || null,
      tags: parseTags(tags),
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 min-[600px]:grid-cols-2 min-[1200px]:grid-cols-4">
        <label className="field">
          <span className="label">Subject</span>
          <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {usable.length === 0 && <option value="">No subjects</option>}
            {usable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.archived_at ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Start</span>
          <input className="input mono" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <label className="field">
          <span className="label">End</span>
          <input className="input mono" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
        </label>
        <label className="field">
          <span className="label">Studied, min</span>
          <input
            className="input mono"
            type="number"
            min={1}
            inputMode="numeric"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="Start to end"
          />
        </label>
      </div>
      <div className="grid gap-4 min-[600px]:grid-cols-[2fr_1fr]">
        <label className="field">
          <span className="label">Note</span>
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Optional" />
        </label>
        <label className="field">
          <span className="label">Tags, comma separated</span>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Optional" />
        </label>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="submit" className="btn btn-primary" disabled={usable.length === 0}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        {onDelete &&
          (confirmDelete ? (
            <>
              <span className="label ml-2">Delete this session?</span>
              <button type="button" className="btn" onClick={onDelete}>
                Delete
              </button>
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" className="btn ml-auto" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          ))}
        {error && (
          <p className="msg msg-error ml-2 basis-full min-[600px]:basis-auto" role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  )
}
