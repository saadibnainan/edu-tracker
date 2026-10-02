'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useData } from '@/lib/db/hooks'
import { getSnapshot, hasRow, newId, save } from '@/lib/db/store'
import { formatShortClock } from '@/lib/format'
import { beep, notify, requestNotifications, unlockAudio } from '@/lib/timer/alerts'
import {
  advance,
  displayMs,
  elapsedMs,
  MIN_SESSION_SECONDS,
  pause as pauseT,
  resume as resumeT,
  setCountdown as setCountdownT,
  setMode as setModeT,
  start as startT,
  stop as stopT,
  type PomodoroConfig,
  type SessionDraft,
  type TimerMode,
  type TimerState,
} from '@/lib/timer/timer'
import { getConfig, getServerConfig, getServerTimer, getTimer, setConfig, setTimer, subscribeTimer } from '@/lib/timer/timerStore'

interface TimerContext {
  state: TimerState
  config: PomodoroConfig
  now: number
  display: number
  elapsed: number
  start: (subjectId: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
  toggle: () => void
  setMode: (m: TimerMode) => void
  setCountdown: (minutes: number) => void
  setSubject: (id: string) => void
  setConfig: (c: PomodoroConfig) => void
  /** Id of the session just saved, for the note form. */
  lastSaved: string | null
  dismissSaved: () => void
  notice: string | null
}

const Ctx = createContext<TimerContext | null>(null)

export function useTimer(): TimerContext {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTimer outside TimerProvider')
  return c
}

const ALERT_WINDOW_MS = 15_000

function alertFor(phase: 'focus' | 'short' | 'long' | 'countdown'): [string, string] {
  if (phase === 'countdown') return ['Countdown finished', 'Session saved.']
  if (phase === 'focus') return ['Focus done', 'Break started. Session saved.']
  return ['Break over', 'Start the next focus when ready.']
}

async function persistDraft(d: SessionDraft) {
  // Another tab may already have saved this run; never overwrite its note.
  if (hasRow('sessions', d.id)) return
  await save('sessions', {
    id: d.id,
    subject_id: d.subjectId,
    started_at: new Date(d.startedAt).toISOString(),
    ended_at: new Date(d.endedAt).toISOString(),
    duration_seconds: d.durationSeconds,
    kind: d.kind,
    note: null,
    tags: [],
    deleted_at: null,
  })
}

export function TimerProvider({ subjectNames, children }: { subjectNames: Map<string, string>; children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribeTimer, getTimer, getServerTimer)
  const config = useSyncExternalStore(subscribeTimer, getConfig, getServerConfig)
  const { ready } = useData()
  const [now, setNow] = useState(() => Date.now())
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = useCallback((msg: string) => {
    setNotice(msg)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 4000)
  }, [])

  // Advances past phase ends using exact timestamps. Runs on every tick and
  // once the local store is ready, which also catches up after a reload.
  const check = useCallback(() => {
    const t = Date.now()
    setNow(t)
    const current = getTimer()
    if (current.status !== 'running') return
    const r = advance(current, getConfig(), t)
    if (r.state === current) return
    setTimer(r.state)
    for (const d of r.sessions) {
      void persistDraft(d)
      setLastSaved(d.id)
    }
    const fresh = r.ended.filter((e) => t - e.at < ALERT_WINDOW_MS)
    const last = fresh.at(-1)
    if (last) {
      beep()
      const [title, body] = alertFor(last.phase)
      void notify(title, body)
      flash(`${title}.`)
    }
  }, [flash])

  const active = state.status !== 'idle'

  useEffect(() => {
    if (!ready || !active) return
    let worker: Worker | null = null
    let interval: ReturnType<typeof setInterval> | null = null
    try {
      worker = new Worker(new URL('../../lib/timer/tick.worker.ts', import.meta.url))
      worker.onmessage = check
      worker.postMessage('start')
    } catch {
      interval = setInterval(check, 250)
    }
    const kick = setTimeout(check, 0)
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(kick)
      worker?.postMessage('stop')
      worker?.terminate()
      if (interval) clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ready, active, check])

  // Document title shows the running clock on every page.
  const display = displayMs(state, config, now)
  const subjectName = state.subjectId ? (subjectNames.get(state.subjectId) ?? '') : ''
  const baseTitle = useRef<string | null>(null)
  useEffect(() => {
    if (state.status === 'idle') {
      if (baseTitle.current !== null) document.title = baseTitle.current
      baseTitle.current = null
      return
    }
    baseTitle.current ??= document.title
    const prefix = state.status === 'paused' ? 'Paused ' : state.mode === 'pomodoro' && state.phase !== 'focus' ? 'Break ' : ''
    document.title = `${prefix}${formatShortClock(display)} ${subjectName}`.trim()
  }, [state.status, state.mode, state.phase, display, subjectName])

  const start = useCallback(
    (subjectId: string) => {
      unlockAudio()
      const s = getTimer()
      if (s.mode !== 'stopwatch') void requestNotifications()
      setTimer(startT(s, Date.now(), subjectId, newId()))
      setLastSaved(null)
      setNow(Date.now())
    },
    [],
  )
  const pause = useCallback(() => setTimer(pauseT(getTimer(), Date.now())), [])
  const resume = useCallback(() => {
    unlockAudio()
    setTimer(resumeT(getTimer(), Date.now()))
  }, [])
  const stop = useCallback(() => {
    const s = getTimer()
    // The session can only be written once the local store has loaded.
    if (s.status === 'idle' || !getSnapshot().ready) return
    const t = Date.now()
    const { state: next, session } = stopT(s, t, getConfig())
    const isBreak = s.mode === 'pomodoro' && s.phase !== 'focus'
    setTimer(next)
    setNow(t)
    if (session) {
      void persistDraft(session)
      setLastSaved(session.id)
    } else if (!isBreak && Math.floor(elapsedMs(s, t) / 1000) < MIN_SESSION_SECONDS) {
      flash('Under a minute, not saved.')
    } else if (isBreak) {
      flash('Break ended.')
    }
  }, [flash])
  const toggle = useCallback(() => {
    const s = getTimer()
    if (s.status === 'running') pause()
    else if (s.status === 'paused') resume()
    else if (s.subjectId) start(s.subjectId)
  }, [pause, resume, start])

  const value = useMemo<TimerContext>(
    () => ({
      state,
      config,
      now,
      display,
      elapsed: elapsedMs(state, now),
      start,
      pause,
      resume,
      stop,
      toggle,
      setMode: (m) => setTimer(setModeT(getTimer(), m)),
      setCountdown: (min) => setTimer(setCountdownT(getTimer(), min)),
      setSubject: (id) => {
        const s = getTimer()
        if (s.status === 'idle') setTimer({ ...s, subjectId: id })
      },
      setConfig: (c) => {
        if (getTimer().status === 'idle') setConfig(c)
      },
      lastSaved,
      dismissSaved: () => setLastSaved(null),
      notice,
    }),
    [state, config, now, display, start, pause, resume, stop, toggle, lastSaved, notice],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
