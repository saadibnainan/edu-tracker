'use client'

import { useData } from '@/lib/db/hooks'
import { runSync } from '@/lib/db/store'
import { formatTime } from '@/lib/format'

export function SyncStatus() {
  const { ready, sync } = useData()
  let text = 'Loading'
  if (ready) {
    const queued = sync.queued === 1 ? '1 write queued' : `${sync.queued} writes queued`
    if (!sync.online) text = sync.queued ? `Offline. ${queued}.` : 'Offline'
    else if (sync.syncing) text = 'Syncing'
    else if (sync.error) text = sync.queued ? `Sync paused. ${queued}.` : 'Sync paused. Retrying.'
    else if (sync.queued) text = queued
    else if (sync.lastSyncedAt) text = `Synced ${formatTime(new Date(sync.lastSyncedAt))}`
    else text = 'Not synced yet'
  }
  return (
    <div className="flex flex-col gap-1 min-w-0" role="status" aria-live="polite">
      <span className="label">{text}</span>
      {ready && sync.failed > 0 && (
        <button type="button" className="link-action text-left" onClick={() => void runSync()}>
          {sync.failed === 1 ? '1 write failed. Retry.' : `${sync.failed} writes failed. Retry.`}
        </button>
      )}
    </div>
  )
}
