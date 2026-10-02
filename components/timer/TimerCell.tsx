'use client'

import Link from 'next/link'
import { useEffect, useMemo } from 'react'
import { Cell } from '@/components/ui/Cell'
import { SubjectSquare } from '@/components/ui/SubjectSquare'
import { useData } from '@/lib/db/hooks'
import { formatClock, formatDuration, formatTime } from '@/lib/format'
import { dayTotals, periodTotal } from '@/lib/stats/stats'
import type { TimerMode } from '@/lib/timer/timer'
import { NoteForm } from './NoteForm'
import { useTimer } from './TimerProvider'

const MODES: { id: TimerMode; label: string }[] = [
  { id: 'stopwatch', label: 'Stopwatch' },
  { id: 'countdown', label: 'Countdown' },
  { id: 'pomodoro', label: 'Pomodoro' },
]

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  return el.closest('input, textarea, select, button, a, summary, [role="button"], [role="radio"]') !== null
}

function NumberField({ label, value, min, max, disabled, onChange }: { label: string; value: number; min: number; max: number; disabled: boolean; onChange: (n: number) => void }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input
        className="input mono w-full"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isInteger(n) && n >= min && n <= max) onChange(n)
        }}
      />
    </label>
  )
}

export function TimerCell() {
  const t = useTimer()
  const { ready, subjects, sessions } = useData()
  const { state, config } = t
  const active = useMemo(() => subjects.filter((s) => !s.archived_at), [subjects])
  const subjectId = state.subjectId && active.some((s) => s.id === state.subjectId) ? state.subjectId : (active[0]?.id ?? null)
  const subject = subjects.find((s) => s.id === (state.status === 'idle' ? subjectId : state.subjectId))
  const idle = state.status === 'idle'
  const running = state.status === 'running'
  const isBreak = state.mode === 'pomodoro' && state.phase !== 'focus' && !idle

  // Space toggles start/pause, S stops. Ignored while typing or on a focused control.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTyping(e.target)) return
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        if (idle && subjectId) t.start(subjectId)
        else t.toggle()
      } else if (e.key === 's' || e.key === 'S') {
        if (!idle) {
          e.preventDefault()
          t.stop()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [t, idle, subjectId])

  const totals = useMemo(() => dayTotals(sessions), [sessions])
  const today = periodTotal(totals.all, 'today', new Date(t.now)) + (running || state.status === 'paused' ? (isBreak ? 0 : Math.floor(t.elapsed / 1000)) : 0)

  const stateLabel = running ? (isBreak ? 'Break' : 'Running') : state.status === 'paused' ? 'Paused' : null
  const phaseText =
    state.mode === 'pomodoro'
      ? state.phase === 'focus'
        ? `Focus ${Math.min(state.completedFocus + 1, config.cycles)} of ${config.cycles}`
        : state.phase === 'short'
          ? 'Short break'
          : 'Long break'
      : null

  return (
    <Cell
      index="01"
      title="Timer"
      className={`col-span-12 min-[1200px]:col-span-8 ${running ? 'running-bar' : ''}`}
      aside={
        stateLabel && (
          <span className="label flex items-center gap-2 text-text!">
            {running && <i className="sq bg-accent" />}
            {stateLabel}
          </span>
        )
      }
    >
      {ready && active.length === 0 && idle ? (
        <div className="flex flex-col gap-4 items-start">
          <p className="text-muted">Add a subject to start timing.</p>
          <Link href="/subjects" className="btn btn-primary">
            Add subject
          </Link>
        </div>
      ) : (
        <>
          <div className="seg" role="group" aria-label="Timer mode">
            {MODES.map((m) => (
              <button key={m.id} type="button" aria-pressed={state.mode === m.id} disabled={!idle && state.mode !== m.id} onClick={() => t.setMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>

          <div
            className={`timer-display my-8 max-[599px]:my-6 ${running && !isBreak ? 'text-accent' : ''}`}
            role="timer"
            aria-live="off"
            suppressHydrationWarning
          >
            {formatClock(t.display)}
          </div>

          <dl className="grid grid-cols-2 min-[600px]:grid-cols-[auto_auto_auto_auto] justify-start gap-x-8 gap-y-4 mb-6">
            <div className="min-w-0 col-span-2 min-[600px]:col-span-1">
              <dt className="label">Subject</dt>
              <dd className="mt-0">
                {idle ? (
                  <label className="flex items-center gap-2">
                    <span className="sr-only">Subject</span>
                    {subject && <SubjectSquare color={subject.color_index} />}
                    <select
                      className="input h-8! py-0! pl-2! min-w-[180px]"
                      value={subjectId ?? ''}
                      onChange={(e) => t.setSubject(e.target.value)}
                      disabled={!ready || active.length === 0}
                    >
                      {active.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span className="flex items-center gap-2 h-8">
                    {subject && <SubjectSquare color={subject.color_index} />}
                    <span className="truncate">{subject?.name ?? 'Unknown subject'}</span>
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="label">Started</dt>
              <dd className="num h-8 flex items-center">{state.firstStartedAt && !idle ? formatTime(new Date(state.firstStartedAt)) : '-'}</dd>
            </div>
            <div>
              <dt className="label">Today</dt>
              <dd className="num h-8 flex items-center">{formatDuration(today)}</dd>
            </div>
            {phaseText && (
              <div>
                <dt className="label">Phase</dt>
                <dd className="num h-8 flex items-center">{phaseText}</dd>
              </div>
            )}
          </dl>

          {idle && state.mode === 'countdown' && (
            <div className="grid grid-cols-2 min-[600px]:grid-cols-4 gap-4 mb-6">
              <NumberField label="Minutes" value={Math.round(state.countdownMs / 60_000)} min={1} max={1440} disabled={!idle} onChange={t.setCountdown} />
            </div>
          )}
          {idle && state.mode === 'pomodoro' && (
            <div className="grid grid-cols-2 min-[600px]:grid-cols-4 gap-4 mb-6">
              <NumberField label="Focus, min" value={config.focusMin} min={1} max={180} disabled={!idle} onChange={(n) => t.setConfig({ ...config, focusMin: n })} />
              <NumberField label="Short break" value={config.shortMin} min={1} max={60} disabled={!idle} onChange={(n) => t.setConfig({ ...config, shortMin: n })} />
              <NumberField label="Long break" value={config.longMin} min={1} max={120} disabled={!idle} onChange={(n) => t.setConfig({ ...config, longMin: n })} />
              <NumberField label="Cycles" value={config.cycles} min={1} max={12} disabled={!idle} onChange={(n) => t.setConfig({ ...config, cycles: n })} />
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {idle && (
              <button type="button" className="btn btn-primary" disabled={!subjectId} onClick={() => subjectId && t.start(subjectId)}>
                {state.mode === 'pomodoro' && state.completedFocus > 0 ? 'Start focus' : 'Start'}
              </button>
            )}
            {running && (
              <button type="button" className="btn btn-primary" onClick={t.pause}>
                Pause
              </button>
            )}
            {state.status === 'paused' && (
              <button type="button" className="btn btn-primary" onClick={t.resume}>
                Resume
              </button>
            )}
            {!idle && (
              <button type="button" className="btn" onClick={t.stop}>
                {isBreak ? 'Skip break' : 'Stop'}
              </button>
            )}
            <span className="label ml-2 max-[599px]:hidden">{idle ? 'Space start' : 'Space pause / S stop'}</span>
          </div>

          {t.notice && (
            <p className="msg mt-4" role="status">
              {t.notice}
            </p>
          )}
          {t.lastSaved && <NoteForm key={t.lastSaved} sessionId={t.lastSaved} onDone={t.dismissSaved} />}
        </>
      )}
    </Cell>
  )
}
