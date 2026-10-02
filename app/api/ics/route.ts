import { NextResponse, type NextRequest } from 'next/server'
import { fetchIcs, IcsFetchError } from '@/lib/ics/fetch'
import { parseIcs } from '@/lib/ics/parse'
import { supabaseServer } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_WINDOW_MS = 32 * 86_400_000

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * GET /api/ics?source=<uuid>&from=<iso>&to=<iso>
 * Fetches the user's calendar feed server-side (no CORS) and returns the
 * events overlapping [from, to). The feed URL is never logged: subscription
 * links usually carry a secret token.
 */
export async function GET(request: NextRequest) {
  const supabase = await supabaseServer()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) return fail('Sign in to load calendars.', 401)

  const p = request.nextUrl.searchParams
  const source = p.get('source') ?? ''
  const from = new Date(p.get('from') ?? '')
  const to = new Date(p.get('to') ?? '')
  if (!UUID.test(source)) return fail('Unknown calendar.', 400)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > MAX_WINDOW_MS) {
    return fail('Invalid date range.', 400)
  }

  // RLS limits this to the signed-in user's rows.
  const { data: row, error } = await supabase.from('calendar_sources').select('url').eq('id', source).is('deleted_at', null).maybeSingle()
  if (error) return fail('Calendar could not be loaded.', 502)
  if (!row) return fail('Unknown calendar.', 404)

  try {
    const text = await fetchIcs(row.url)
    const events = parseIcs(text, from, to)
    return NextResponse.json({ events }, { headers: { 'cache-control': 'private, max-age=900' } })
  } catch (err) {
    if (err instanceof IcsFetchError) return fail(err.message, err.status)
    return fail('That link did not return a valid calendar file.', 422)
  }
}
