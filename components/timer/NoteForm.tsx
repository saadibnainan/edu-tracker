'use client'

import { useState } from 'react'
import { useData } from '@/lib/db/hooks'
import { update } from '@/lib/db/store'
import { formatDuration, parseTags } from '@/lib/format'

/** Shown after a session is saved: optional note and tags. */
export function NoteForm({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const { sessions } = useData()
  const session = sessions.find((s) => s.id === sessionId)
  const [note, setNote] = useState('')
  const [tags, setTags] = useState('')

  if (!session) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await update('sessions', sessionId, { note: note.trim() || null, tags: parseTags(tags) })
    onDone()
  }

  return (
    <form onSubmit={submit} className="mt-6 pt-6 border-t border-line flex flex-col gap-4" aria-label="Session note">
      <p className="label">
        Session saved, <span className="text-text">{formatDuration(session.duration_seconds)}</span>. Add a note?
      </p>
      <div className="grid gap-4 min-[600px]:grid-cols-[2fr_1fr]">
        <label className="field">
          <span className="label">Note</span>
          <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="What did you cover?" rows={3} />
        </label>
        <label className="field">
          <span className="label">Tags, comma separated</span>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="chapter 3, exercises" />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn">
          Save note
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Skip
        </button>
      </div>
    </form>
  )
}
