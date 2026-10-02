'use client'

import { useSyncExternalStore } from 'react'
import { getServerSnapshot, getSnapshot, subscribe, type Snapshot } from './store'

export function useData(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
