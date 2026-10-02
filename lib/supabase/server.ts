import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'
import { supabaseEnv } from './env'

/** New client per request. Cookie writes fail silently in Server Components; proxy.ts refreshes sessions. */
export async function supabaseServer() {
  const store = await cookies()
  const { url, key } = supabaseEnv()
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options)
        } catch {
          // Called from a Server Component; proxy.ts handles the refresh.
        }
      },
    },
  })
}

/** Verified user id and email from the JWT, or null. */
export async function currentUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) return null
  return { id: data.claims.sub, email: typeof data.claims.email === 'string' ? data.claims.email : '' }
}
