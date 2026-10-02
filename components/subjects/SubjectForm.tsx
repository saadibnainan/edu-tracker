'use client'

import { useId, useState } from 'react'
import { parseHoursInput } from '@/lib/format'
import { SUBJECT_COLOR_NAMES, SUBJECT_COLORS } from '@/lib/types'

export interface SubjectFormValue {
  name: string
  color_index: number
  weekly_target_minutes: number | null
}

function minutesToInput(m: number | null): string {
  if (m === null) return ''
  return m % 60 === 0 ? String(m / 60) : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

export function SubjectForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: SubjectFormValue
  submitLabel: string
  onSubmit: (v: SubjectFormValue) => void | Promise<void>
  onCancel?: () => void
}) {
  const id = useId()
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color_index ?? 0)
  const [target, setTarget] = useState(minutesToInput(initial?.weekly_target_minutes ?? null))
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return setError('Enter a name.')
    if (trimmed.length > 80) return setError('Keep the name under 80 characters.')
    let minutes: number | null = null
    if (target.trim()) {
      minutes = parseHoursInput(target)
      if (minutes === null || minutes < 1 || minutes > 168 * 60) return setError('Weekly target must be hours, like 6 or 4:30.')
    }
    setError(null)
    if (!initial) {
      setName('')
      setTarget('')
    }
    await onSubmit({ name: trimmed, color_index: color, weekly_target_minutes: minutes })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div className="grid gap-4 min-[600px]:grid-cols-[1fr_160px]">
        <label className="field">
          <span className="label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Linear Algebra" required />
        </label>
        <label className="field">
          <span className="label">Weekly target, hours</span>
          <input className="input mono" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Optional" inputMode="decimal" />
        </label>
      </div>
      <fieldset className="field">
        <legend className="label mb-2">Color</legend>
        <div className="flex flex-wrap" role="radiogroup" aria-label="Color">
          {SUBJECT_COLORS.map((c, i) => (
            <label key={c} className="relative cursor-pointer">
              <input
                type="radio"
                name={`${id}-color`}
                value={i}
                checked={color === i}
                onChange={() => setColor(i)}
                className="peer sr-only"
                aria-label={SUBJECT_COLOR_NAMES[i]}
              />
              <span
                className="grid place-items-center w-10 h-10 border border-line-strong -ml-px first:ml-0 transition-colors duration-[120ms] ease-linear hover:bg-text peer-checked:bg-raised peer-checked:border-text peer-checked:relative peer-checked:z-10 peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2"
                title={SUBJECT_COLOR_NAMES[i]}
              >
                <i className="sq" style={{ background: c }} />
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        {error && (
          <p className="msg msg-error ml-2" role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  )
}
