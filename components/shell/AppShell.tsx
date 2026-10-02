'use client'

import { useEffect, useMemo } from 'react'
import { TimerProvider } from '@/components/timer/TimerProvider'
import { useData } from '@/lib/db/hooks'
import { initStore } from '@/lib/db/store'
import { Sidebar } from './Sidebar'

export function AppShell({ userId, email, children }: { userId: string; email: string; children: React.ReactNode }) {
  useEffect(() => {
    void initStore(userId)
  }, [userId])

  useEffect(() => {
    // Lets the service worker cache every page while online, so they open offline.
    if (!('serviceWorker' in navigator)) return
    void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'warm', urls: ['/', '/history', '/subjects', '/goals', '/stats', '/calendar'] }))
  }, [])

  const { subjects } = useData()
  const names = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects])

  return (
    <TimerProvider subjectNames={names}>
      <div className="min-h-dvh grid grid-cols-1 grid-rows-[auto_1fr] min-[900px]:grid-cols-[200px_1fr] min-[900px]:grid-rows-1">
        <Sidebar email={email} />
        <main className="min-w-0 flex flex-col">{children}</main>
      </div>
    </TimerProvider>
  )
}
