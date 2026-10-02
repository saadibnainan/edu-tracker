import { NextResponse, type NextRequest } from 'next/server'
import { asUser } from '@/lib/server/db'
import { TABLE_NAMES, upsertSql, validateRow } from '@/lib/server/rows'
import { currentUser } from '@/lib/server/session'
import type { TableName } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_ROWS = 200
const NO_STORE = { 'cache-control': 'no-store' }

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE })
}

function serialize(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v
  return out
}

/** Every row the signed-in user owns, per table. RLS limits the result as well. */
export async function GET(request: NextRequest) {
  const user = await currentUser(request.headers)
  if (!user) return fail('Sign in to sync.', 401)
  const data = await asUser(user.id, async (db) => {
    const out: Record<string, unknown[]> = {}
    for (const t of TABLE_NAMES) {
      const { rows } = await db.query(`select * from public.${t} where user_id = $1 order by id`, [user.id])
      out[t] = rows.map(serialize)
    }
    return out
  })
  return NextResponse.json(data, { headers: NO_STORE })
}

/**
 * Upserts a batch from the client outbox: { table, rows }. Each row runs in
 * its own savepoint, so one rejected row does not block the rest. The result
 * lists, per id, whether it was stored or why not.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) return fail('Cross-origin request refused.', 403)
  if (!request.headers.get('content-type')?.startsWith('application/json')) return fail('Expected JSON.', 415)

  const user = await currentUser(request.headers)
  if (!user) return fail('Sign in to sync.', 401)

  const body = (await request.json().catch(() => null)) as { table?: unknown; rows?: unknown } | null
  const table = body?.table as TableName
  if (!body || !TABLE_NAMES.includes(table)) return fail('Unknown table.', 400)
  if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > MAX_ROWS) return fail(`Send 1 to ${MAX_ROWS} rows.`, 400)

  const sql = upsertSql(table)
  const results = await asUser(user.id, async (db) => {
    const out: { id: string | null; ok: boolean; error?: string; code?: string }[] = []
    for (const raw of body.rows as unknown[]) {
      const row = validateRow(table, raw)
      if (typeof row === 'string') {
        const id = raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string' ? (raw as { id: string }).id : null
        out.push({ id, ok: false, error: row, code: 'invalid' })
        continue
      }
      await db.query('savepoint row')
      try {
        await db.query(sql, [...row.values, user.id])
        await db.query('release savepoint row')
        out.push({ id: row.id, ok: true })
      } catch (err) {
        await db.query('rollback to savepoint row')
        const e = err as { code?: string; message?: string }
        out.push({ id: row.id, ok: false, error: e.message ?? 'Rejected.', code: e.code })
      }
    }
    return out
  })
  return NextResponse.json({ results }, { headers: NO_STORE })
}
