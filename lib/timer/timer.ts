// Pure timer state machine. Elapsed time is always derived from stored
// timestamps, never accumulated tick by tick, so it survives tab sleep,
// refresh and tab close.

import type { SessionKind } from '@/lib/types'

export type TimerMode = 'stopwatch' | 'countdown' | 'pomodoro'
export type PomodoroPhase = 'focus' | 'short' | 'long'
export type TimerStatus = 'idle' | 'running' | 'paused'

export interface PomodoroConfig {
  focusMin: number
  shortMin: number
  longMin: number
  /** Focus phases before a long break. */
  cycles: number
}

export const DEFAULT_POMODORO: PomodoroConfig = { focusMin: 25, shortMin: 5, longMin: 15, cycles: 4 }

export interface TimerState {
  status: TimerStatus
  mode: TimerMode
  subjectId: string | null
  /**
   * Id the saved session will get. Fixed at start, so two tabs that both
   * notice a phase end upsert the same row instead of creating duplicates.
   */
  sessionId: string | null
  /** Start of the current running segment, epoch ms. Null while paused or idle. */
  segmentStartedAt: number | null
  /** Time from finished segments of the current phase. */
  accumulatedMs: number
  /** When the current session (or pomodoro phase) first started. */
  firstStartedAt: number | null
  countdownMs: number
  phase: PomodoroPhase
  /** Focus phases completed in the current cycle. */
  completedFocus: number
}

export interface SessionDraft {
  id: string
  subjectId: string
  startedAt: number
  endedAt: number
  durationSeconds: number
  kind: SessionKind
}

/** Shorter runs are discarded on stop. */
export const MIN_SESSION_SECONDS = 60

export function initialTimer(mode: TimerMode = 'stopwatch'): TimerState {
  return {
    status: 'idle',
    mode,
    subjectId: null,
    sessionId: null,
    segmentStartedAt: null,
    accumulatedMs: 0,
    firstStartedAt: null,
    countdownMs: 25 * 60_000,
    phase: 'focus',
    completedFocus: 0,
  }
}

export function elapsedMs(s: TimerState, now: number): number {
  const running = s.segmentStartedAt === null ? 0 : Math.max(0, now - s.segmentStartedAt)
  return s.accumulatedMs + running
}

export function phaseMs(phase: PomodoroPhase, cfg: PomodoroConfig): number {
  const min = phase === 'focus' ? cfg.focusMin : phase === 'short' ? cfg.shortMin : cfg.longMin
  return min * 60_000
}

/** Target length of the current run, or null for an open-ended stopwatch. */
export function targetMs(s: TimerState, cfg: PomodoroConfig): number | null {
  if (s.mode === 'countdown') return s.countdownMs
  if (s.mode === 'pomodoro') return phaseMs(s.phase, cfg)
  return null
}

export function remainingMs(s: TimerState, cfg: PomodoroConfig, now: number): number | null {
  const target = targetMs(s, cfg)
  if (target === null) return null
  return Math.max(0, target - elapsedMs(s, now))
}

/** The value the big display shows: remaining for countdown/pomodoro, elapsed for stopwatch. */
export function displayMs(s: TimerState, cfg: PomodoroConfig, now: number): number {
  if (s.status === 'idle') {
    const target = targetMs(s, cfg)
    return target ?? 0
  }
  return remainingMs(s, cfg, now) ?? elapsedMs(s, now)
}

export function start(s: TimerState, now: number, subjectId: string, sessionId: string): TimerState {
  if (s.status !== 'idle') return s
  return { ...s, status: 'running', subjectId, sessionId, segmentStartedAt: now, accumulatedMs: 0, firstStartedAt: now }
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== 'running' || s.segmentStartedAt === null) return s
  return { ...s, status: 'paused', accumulatedMs: elapsedMs(s, now), segmentStartedAt: null }
}

export function resume(s: TimerState, now: number): TimerState {
  if (s.status !== 'paused') return s
  return { ...s, status: 'running', segmentStartedAt: now }
}

export function setMode(s: TimerState, mode: TimerMode): TimerState {
  if (s.status !== 'idle') return s
  return { ...s, mode, phase: 'focus', completedFocus: 0 }
}

export function setCountdown(s: TimerState, minutes: number): TimerState {
  if (s.status !== 'idle') return s
  const clamped = Math.min(24 * 60, Math.max(1, Math.round(minutes)))
  return { ...s, countdownMs: clamped * 60_000 }
}

function kindFor(mode: TimerMode): SessionKind {
  return mode
}

function draft(s: TimerState, endedAt: number, workedMs: number): SessionDraft | null {
  if (!s.subjectId || !s.sessionId || s.firstStartedAt === null) return null
  const durationSeconds = Math.floor(workedMs / 1000)
  if (durationSeconds < MIN_SESSION_SECONDS) return null
  return { id: s.sessionId, subjectId: s.subjectId, startedAt: s.firstStartedAt, endedAt, durationSeconds, kind: kindFor(s.mode) }
}

/**
 * Stops the run. Returns the session to save, or null when nothing should be
 * saved (under a minute, or a pomodoro break).
 */
export function stop(s: TimerState, now: number, cfg: PomodoroConfig): { state: TimerState; session: SessionDraft | null } {
  if (s.status === 'idle') return { state: s, session: null }
  const target = targetMs(s, cfg)
  const worked = target === null ? elapsedMs(s, now) : Math.min(target, elapsedMs(s, now))
  const isBreak = s.mode === 'pomodoro' && s.phase !== 'focus'
  const session = isBreak ? null : draft(s, now, worked)
  const reset = { ...initialTimer(s.mode), countdownMs: s.countdownMs, subjectId: s.subjectId }
  return { state: reset, session }
}

export interface AdvanceResult {
  state: TimerState
  /** Sessions completed while advancing (finished countdowns and focus phases). */
  sessions: SessionDraft[]
  /** Phase ends that happened, with their exact end time. */
  ended: { phase: PomodoroPhase | 'countdown'; at: number }[]
}

/**
 * Moves a running countdown or pomodoro past any phase ends that have already
 * happened, using exact end timestamps. Safe to call on every tick and after a
 * page reload that happened long after the phase ended.
 *
 * Pomodoro: a finished focus phase saves a session and starts the break
 * immediately. A finished break waits for the user (status idle, phase focus),
 * so a closed tab cannot generate a chain of phantom focus sessions.
 */
export function advance(s: TimerState, cfg: PomodoroConfig, now: number): AdvanceResult {
  const sessions: SessionDraft[] = []
  const ended: AdvanceResult['ended'] = []
  let state = s

  for (let guard = 0; guard < 4; guard++) {
    if (state.status !== 'running' || state.segmentStartedAt === null) break
    const target = targetMs(state, cfg)
    if (target === null) break
    const elapsed = elapsedMs(state, now)
    if (elapsed < target) break

    const endAt = now - (elapsed - target)

    if (state.mode === 'countdown') {
      const d = draft(state, endAt, target)
      if (d) sessions.push(d)
      ended.push({ phase: 'countdown', at: endAt })
      state = { ...initialTimer('countdown'), countdownMs: state.countdownMs, subjectId: state.subjectId }
      break
    }

    // Pomodoro
    ended.push({ phase: state.phase, at: endAt })
    if (state.phase === 'focus') {
      const d = draft(state, endAt, target)
      if (d) sessions.push(d)
      const completedFocus = state.completedFocus + 1
      const nextPhase: PomodoroPhase = completedFocus >= cfg.cycles ? 'long' : 'short'
      state = {
        ...state,
        phase: nextPhase,
        completedFocus: nextPhase === 'long' ? 0 : completedFocus,
        segmentStartedAt: endAt,
        accumulatedMs: 0,
        firstStartedAt: endAt,
      }
    } else {
      state = {
        ...state,
        status: 'idle',
        phase: 'focus',
        segmentStartedAt: null,
        accumulatedMs: 0,
        firstStartedAt: null,
      }
    }
  }

  return { state, sessions, ended }
}

/** Defensive parse of persisted state; returns null if the shape is wrong. */
export function parseTimerState(raw: unknown): TimerState | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const modes: TimerMode[] = ['stopwatch', 'countdown', 'pomodoro']
  const statuses: TimerStatus[] = ['idle', 'running', 'paused']
  const phases: PomodoroPhase[] = ['focus', 'short', 'long']
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  if (!modes.includes(r.mode as TimerMode) || !statuses.includes(r.status as TimerStatus) || !phases.includes(r.phase as PomodoroPhase)) return null
  if (!num(r.accumulatedMs) || !num(r.countdownMs) || !num(r.completedFocus)) return null
  if (r.segmentStartedAt !== null && !num(r.segmentStartedAt)) return null
  if (r.firstStartedAt !== null && !num(r.firstStartedAt)) return null
  if (r.subjectId !== null && typeof r.subjectId !== 'string') return null
  if (r.sessionId !== null && typeof r.sessionId !== 'string') return null
  return r as unknown as TimerState
}

export function parsePomodoroConfig(raw: unknown): PomodoroConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_POMODORO
  const r = raw as Record<string, unknown>
  const pick = (k: keyof PomodoroConfig, min: number, max: number) => {
    const v = r[k]
    return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : DEFAULT_POMODORO[k]
  }
  return { focusMin: pick('focusMin', 1, 180), shortMin: pick('shortMin', 1, 60), longMin: pick('longMin', 1, 120), cycles: pick('cycles', 1, 12) }
}
