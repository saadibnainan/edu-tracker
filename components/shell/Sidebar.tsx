'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { resetStore } from '@/lib/db/store'
import { authClient } from '@/lib/auth-client'
import { clearTimerStorage } from '@/lib/timer/timerStore'
import { SyncStatus } from './SyncStatus'

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/history', label: 'History' },
  { href: '/subjects', label: 'Subjects' },
  { href: '/goals', label: 'Goals' },
  { href: '/stats', label: 'Stats' },
  { href: '/calendar', label: 'Calendar' },
]

export function Sidebar({ email }: { email: string }) {
  const path = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    await authClient.signOut().catch(() => {})
    await resetStore()
    clearTimerStorage()
    navigator.serviceWorker?.controller?.postMessage({ type: 'clear' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <aside className="flex flex-col border-b border-line min-[900px]:border-b-0 min-[900px]:border-r min-[900px]:h-dvh min-[900px]:sticky min-[900px]:top-0">
      <div className="h-14 shrink-0 px-4 min-[900px]:px-6 flex items-center border-b border-line font-mono font-medium tracking-[0.08em]">EDU-TRACKER</div>
      <nav aria-label="Main">
        <ul className="grid grid-cols-3 min-[900px]:grid-cols-1 min-[900px]:py-2">
          {NAV.map((n, i) => {
            const current = n.href === '/' ? path === '/' : path.startsWith(n.href)
            return (
              <li
                key={n.href}
                className={`border-line max-[899px]:border-b ${i % 3 !== 2 ? 'max-[899px]:border-r' : ''}`}
              >
                <Link href={n.href} className="nav-link max-[899px]:px-4" aria-current={current ? 'page' : undefined}>
                  {n.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="min-[900px]:mt-auto min-[900px]:border-t border-line px-4 min-[900px]:px-6 py-2 min-[900px]:py-4 flex min-[900px]:flex-col gap-x-4 gap-y-2 items-center min-[900px]:items-start justify-between flex-wrap">
        <SyncStatus />
        <div className="flex min-[900px]:flex-col gap-x-4 gap-y-2 items-center min-[900px]:items-start min-w-0">
          <span className="label normal-case! tracking-normal! truncate max-w-[152px] max-[899px]:hidden" title={email}>
            {email}
          </span>
          <button type="button" className="link-action" onClick={signOut} disabled={signingOut}>
            {signingOut ? 'Signing out' : 'Sign out'}
          </button>
        </div>
      </div>
    </aside>
  )
}
