'use client'

import { useSyncExternalStore } from 'react'
import { formatLongDate } from '@/lib/format'

const subscribe = () => () => {}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  // The date is computed in the browser so it matches the viewer's zone.
  const date = useSyncExternalStore(subscribe, () => formatLongDate(new Date()), () => '')
  return (
    <header className="h-14 shrink-0 border-b border-line flex items-center justify-between gap-4 px-4 min-[900px]:px-6">
      <h1 className="font-medium">{title}</h1>
      <div className="flex items-center gap-4">
        {children}
        <span className="label max-[599px]:hidden" suppressHydrationWarning>
          {date}
        </span>
      </div>
    </header>
  )
}
