import { redirect } from 'next/navigation'
import { AppShell } from '@/components/shell/AppShell'
import { currentUser } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  return (
    <AppShell userId={user.id} email={user.email}>
      {children}
    </AppShell>
  )
}
