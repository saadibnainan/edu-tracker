import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/server/session'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect('/')
  const { error } = await searchParams
  return (
    <main className="min-h-dvh grid place-items-center p-4">
      <div className="w-full max-w-[400px] border border-line bg-surface">
        <div className="h-14 px-6 flex items-center border-b border-line font-mono font-medium tracking-[0.08em]">EDU-TRACKER</div>
        <div className="p-6">
          <h1 className="label mb-6">
            <b>01</b>
            <span className="sr-only"> </span>Sign in
          </h1>
          <LoginForm linkError={Boolean(error)} />
        </div>
      </div>
    </main>
  )
}
