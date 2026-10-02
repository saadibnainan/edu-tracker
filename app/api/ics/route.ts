import { NextResponse, type NextRequest } from 'next/server'
import { fetchIcs, IcsFetchError } from '@/lib/ics/fetch'
import { parseIcs } from '@/lib/ics/parse'
import { asUser } from '@/lib/server/db'
import { currentUser } from '@/lib/server/session'

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
  const user = await currentUser(request.headers)
  if (!user) return fail('Sign in to load calendars.', 401)

  const p = request.nextUrl.searchParams
  const source = p.get('source') ?? ''
  const from = new Date(p.get('from') ?? '')
  const to = new Date(p.get('to') ?? '')
  if (!UUID.test(source)) return fail('Unknown calendar.', 400)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > MAX_WINDOW_MS) {
    return fail('Invalid date range.', 400)
  }

  // RLS limits this to the signed-in user's rows.
  let row: { url: string } | undefined
  try {
    row = await asUser(user.id, async (db) => {
      const r = await db.query<{ url: string }>('select url from public.calendar_sources where id = $1 and deleted_at is null', [source])
      return r.rows[0]
    })
  } catch {
    return fail('Calendar could not be loaded.', 502)
  }
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
