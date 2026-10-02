// Test helpers for the LOCAL Supabase stack only (npm run db:start).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import type { Database } from '../../lib/database.types'

let cached: Record<string, string> | null = null

export function localEnv(): Record<string, string> {
  if (cached) return cached
  const out = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const json = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, string>
  if (!json.API_URL?.startsWith('http://127.0.0.1')) throw new Error('Refusing to run against a non-local Supabase')
  cached = json
  return json
}

export function admin(): SupabaseClient<Database> {
  const env = localEnv()
  return createClient<Database>(env.API_URL!, env.SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

export function anon(): SupabaseClient<Database> {
  const env = localEnv()
  return createClient<Database>(env.API_URL!, env.PUBLISHABLE_KEY ?? env.ANON_KEY!, { auth: { persistSession: false } })
}

/** Creates a confirmed user with a password (local testing only) and returns a signed-in client. */
export async function userClient(email: string): Promise<{ client: SupabaseClient<Database>; id: string }> {
  const password = 'local-test-password-1'
  const a = admin()
  const { data: list } = await a.auth.admin.listUsers({ perPage: 1000 })
  const existing = list?.users.find((u) => u.email === email)
  if (existing) await a.auth.admin.deleteUser(existing.id)
  const { data, error } = await a.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('createUser failed')
  const client = anon()
  const signIn = await client.auth.signInWithPassword({ email, password })
  if (signIn.error) throw signIn.error
  return { client, id: data.user.id }
}

export async function deleteUserByEmail(email: string) {
  const a = admin()
  const { data } = await a.auth.admin.listUsers({ perPage: 1000 })
  const u = data?.users.find((x) => x.email === email)
  if (u) await a.auth.admin.deleteUser(u.id)
}
