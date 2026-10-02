import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

let client: SupabaseClient<Database> | null = null

export function supabaseBrowser(): SupabaseClient<Database> {
  if (!client) {
    // Inlined at build time; must be referenced literally.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
    client = createBrowserClient<Database>(url, key)
  }
  return client
}
