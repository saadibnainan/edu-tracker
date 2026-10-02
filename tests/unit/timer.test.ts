import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POMODORO,
  advance,
  displayMs,
  elapsedMs,
  initialTimer,
  parseTimerState,
  pause,
  remainingMs,
  resume,
  setCountdown,
  setMode,
  start,
  stop,
} from '@/lib/timer/timer'

const T0 = Date.UTC(2026, 9, 2, 12, 0, 0)
const min = (n: number) => n * 60_000
const cfg = DEFAULT_POMODORO

describe('elapsed time', () => {
  it('is zero when idle', () => {
    expect(elapsedMs(initialTimer(), T0)).toBe(0)
  })

  it('derives from the stored start timestamp', () => {
    const s = start(initialTimer(), T0, 'sub', 'sid')
    expect(elapsedMs(s, T0 + 12_345)).toBe(12_345)
  })

  it('survives a reload: a serialized state gives the same elapsed time', () => {
    const s = start(initialTimer(), T0, 'sub', 'sid')
    const restored = parseTimerState(JSON.parse(JSON.stringify(s)))
    expect(restored).not.toBeNull()
    expect(elapsedMs(restored!, T0 + min(90))).toBe(min(90))
  })

  it('freezes while paused and continues after resume', () => {
    let s = start(initialTimer(), T0, 'sub', 'sid')
    s = pause(s, T0 + min(10))
    expect(elapsedMs(s, T0 + min(50))).toBe(min(10))
    s = resume(s, T0 + min(50))
    expect(elapsedMs(s, T0 + min(55))).toBe(min(15))
  })

  it('handles several pause/resume cycles', () => {
    let s = start(initialTimer(), T0, 'sub', 'sid')
    for (let i = 0; i < 5; i++) {
      s = pause(s, T0 + min(i * 10 + 5))
      s = resume(s, T0 + min(i * 10 + 10))
    }
    expect(elapsedMs(s, T0 + min(50))).toBe(min(25))
  })

  it('never goes negative when the clock moves backwards', () => {
    const s = start(initialTimer(), T0, 'sub', 'sid')
    expect(elapsedMs(s, T0 - 5_000)).toBe(0)
  })

  it('carries the session id chosen at start into the saved draft', () => {
    const s = start(initialTimer(), T0, 'sub', 'run-1')
    expect(stop(s, T0 + min(5), cfg).session?.id).toBe('run-1')
  })

  it('ignores invalid transitions', () => {
    const idle = initialTimer()
    expect(pause(idle, T0)).toBe(idle)
    expect(resume(idle, T0)).toBe(idle)
    const running = start(idle, T0, 'sub', 'sid')
    expect(start(running, T0 + 1, 'other', 'x')).toBe(running)
    expect(setMode(running, 'countdown')).toBe(running)
  })
})

describe('stop', () => {
  it('saves elapsed time excluding pauses, from first start to stop', () => {
    let s = start(initialTimer(), T0, 'sub', 'sid')
    s = pause(s, T0 + min(20))
    s = resume(s, T0 + min(30))
    const { state, session } = stop(s, T0 + min(40), cfg)
    expect(state.status).toBe('idle')
    expect(session).toEqual({ id: 'sid', subjectId: 'sub', startedAt: T0, endedAt: T0 + min(40), durationSeconds: 30 * 60, kind: 'stopwatch' })
  })

  it('discards runs under a minute', () => {
    const s = start(initialTimer(), T0, 'sub', 'sid')
    expect(stop(s, T0 + 59_000, cfg).session).toBeNull()
  })

  it('caps a countdown at its target', () => {
    const s = start(setCountdown(setMode(initialTimer(), 'countdown'), 30), T0, 'sub', 'sid')
    expect(stop(s, T0 + min(10), cfg).session?.durationSeconds).toBe(600)
  })
})

describe('countdown', () => {
  it('shows remaining time and clamps at zero', () => {
    const s = start(setCountdown(setMode(initialTimer(), 'countdown'), 30), T0, 'sub', 'sid')
    expect(remainingMs(s, cfg, T0 + min(10))).toBe(min(20))
    expect(remainingMs(s, cfg, T0 + min(45))).toBe(0)
    expect(displayMs(s, cfg, T0 + min(1))).toBe(min(29))
  })

  it('completes at the exact end time even if checked hours later', () => {
    const s = start(setCountdown(setMode(initialTimer(), 'countdown'), 30), T0, 'sub', 'sid')
    const r = advance(s, cfg, T0 + min(300))
    expect(r.state.status).toBe('idle')
    expect(r.sessions).toEqual([{ id: 'sid', subjectId: 'sub', startedAt: T0, endedAt: T0 + min(30), durationSeconds: 1800, kind: 'countdown' }])
    expect(r.ended).toEqual([{ phase: 'countdown', at: T0 + min(30) }])
  })

  it('accounts for pauses when computing the end time', () => {
    let s = start(setCountdown(setMode(initialTimer(), 'countdown'), 30), T0, 'sub', 'sid')
    s = pause(s, T0 + min(10))
    s = resume(s, T0 + min(20))
    const r = advance(s, cfg, T0 + min(60))
    expect(r.sessions[0]?.endedAt).toBe(T0 + min(40))
  })

  it('does nothing before the end', () => {
    const s = start(setCountdown(setMode(initialTimer(), 'countdown'), 30), T0, 'sub', 'sid')
    const r = advance(s, cfg, T0 + min(29))
    expect(r.state).toBe(s)
    expect(r.sessions).toHaveLength(0)
  })

  it('clamps the configured length', () => {
    expect(setCountdown(initialTimer(), 0).countdownMs).toBe(min(1))
    expect(setCountdown(initialTimer(), 99_999).countdownMs).toBe(min(1440))
  })
})

describe('pomodoro', () => {
  const pomo = () => start(setMode(initialTimer(), 'pomodoro'), T0, 'sub', 'sid')

  it('saves a completed focus phase and starts the short break at the exact end', () => {
    const r = advance(pomo(), cfg, T0 + min(26))
    expect(r.sessions).toEqual([{ id: 'sid', subjectId: 'sub', startedAt: T0, endedAt: T0 + min(25), durationSeconds: 1500, kind: 'pomodoro' }])
    expect(r.state.phase).toBe('short')
    expect(r.state.status).toBe('running')
    expect(remainingMs(r.state, cfg, T0 + min(26))).toBe(min(4))
  })

  it('waits for the user after a break instead of chaining focus phases', () => {
    const r = advance(pomo(), cfg, T0 + min(600))
    expect(r.sessions).toHaveLength(1)
    expect(r.state.status).toBe('idle')
    expect(r.state.phase).toBe('focus')
    expect(r.ended.map((e) => e.phase)).toEqual(['focus', 'short'])
  })

  it('takes a long break after the configured number of focus phases', () => {
    let s = pomo()
    let now = T0
    for (let i = 0; i < 4; i++) {
      const focusEnd = advance(s, cfg, now + min(25))
      expect(focusEnd.sessions).toHaveLength(1)
      s = focusEnd.state
      now += min(25)
      if (i < 3) {
        expect(s.phase).toBe('short')
        const breakEnd = advance(s, cfg, now + min(5))
        s = start(breakEnd.state, now + min(5), 'sub', 'sid')
        now += min(5)
      }
    }
    expect(s.phase).toBe('long')
    expect(s.completedFocus).toBe(0)
  })

  it('does not save a session when stopping during a break', () => {
    const r = advance(pomo(), cfg, T0 + min(27))
    expect(stop(r.state, T0 + min(28), cfg).session).toBeNull()
  })

  it('saves a partial focus phase on stop', () => {
    expect(stop(pomo(), T0 + min(10), cfg).session?.durationSeconds).toBe(600)
  })
})

describe('parseTimerState', () => {
  it('rejects malformed data', () => {
    expect(parseTimerState(null)).toBeNull()
    expect(parseTimerState({ status: 'running' })).toBeNull()
    expect(parseTimerState({ ...initialTimer(), mode: 'nope' })).toBeNull()
    expect(parseTimerState({ ...initialTimer(), accumulatedMs: 'x' })).toBeNull()
  })
})
