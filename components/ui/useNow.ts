'use client'

import { useSyncExternalStore } from 'react'

function subscribe(cb: () => void) {
  const id = setInterval(cb, 30_000)
  const onVisible = () => document.visibilityState === 'visible' && cb()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearInterval(id)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/** Current time rounded down to the minute; null during server render. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, () => Math.floor(Date.now() / 60_000) * 60_000, () => null)
}
