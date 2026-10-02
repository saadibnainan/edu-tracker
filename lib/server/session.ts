import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

/** Verified signed-in user from the session cookie, or null. */
export async function currentUser(h?: Headers): Promise<{ id: string; email: string } | null> {
  const session = await auth.api.getSession({ headers: h ?? (await headers()) })
  if (!session) return null
  return { id: session.user.id, email: session.user.email }
}
