// Persists the running timer and pomodoro settings in localStorage (per
// device) and exposes them as an external store. Other tabs follow along via
// the `storage` event.

import { DEFAULT_POMODORO, initialTimer, parsePomodoroConfig, parseTimerState, type PomodoroConfig, type TimerState } from './timer'

export const TIMER_KEY = 'edu.timer.v1'
export const POMODORO_KEY = 'edu.pomodoro.v1'

const SERVER_TIMER = initialTimer()

let timer: TimerState | null = null
let config: PomodoroConfig | null = null
const listeners = new Set<() => void>()
let attached = false

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode or quota: the timer still works for this tab.
  }
}

function emit() {
  for (const l of listeners) l()
}

function attach() {
  if (attached || typeof window === 'undefined') return
  attached = true
  window.addEventListener('storage', (e) => {
    if (e.key === TIMER_KEY || e.key === null) {
      timer = parseTimerState(read(TIMER_KEY)) ?? initialTimer()
      emit()
    }
    if (e.key === POMODORO_KEY || e.key === null) {
      config = parsePomodoroConfig(read(POMODORO_KEY))
      emit()
    }
  })
}

export function subscribeTimer(l: () => void): () => void {
  attach()
  listeners.add(l)
  return () => listeners.delete(l)
}

export function getTimer(): TimerState {
  if (timer === null) timer = parseTimerState(read(TIMER_KEY)) ?? initialTimer()
  return timer
}

export function getServerTimer(): TimerState {
  return SERVER_TIMER
}

export function setTimer(next: TimerState) {
  if (next === timer) return
  timer = next
  write(TIMER_KEY, next)
  emit()
}

export function getConfig(): PomodoroConfig {
  if (config === null) config = parsePomodoroConfig(read(POMODORO_KEY))
  return config
}

export function getServerConfig(): PomodoroConfig {
  return DEFAULT_POMODORO
}

export function setConfig(next: PomodoroConfig) {
  config = parsePomodoroConfig(next)
  write(POMODORO_KEY, config)
  emit()
}

export function clearTimerStorage() {
  try {
    localStorage.removeItem(TIMER_KEY)
    localStorage.removeItem(POMODORO_KEY)
  } catch {}
  timer = initialTimer()
  config = DEFAULT_POMODORO
  emit()
}
