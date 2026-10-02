// Test helpers for the LOCAL Postgres from compose.yaml only.
import { existsSync } from 'node:fs'
import pg from 'pg'

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local')
const url = process.env.DATABASE_URL ?? ''
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('Refusing to run tests against a non-local database')

export const pool = new pg.Pool({ connectionString: url, max: 4 })
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025'
export const MAGIC_LINK = /http:\/\/localhost:3000\/api\/auth\/magic-link\/verify\?[^\s)]+/

const serialize = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]))

/** Inserts rows as the owner role (bypasses RLS), like a seed script. */
export async function insertRows(table: string, rows: Record<string, unknown> | Record<string, unknown>[]) {
  for (const row of Array.isArray(rows) ? rows : [rows]) {
    const cols = Object.keys(row)
    await pool.query(`insert into public.${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(row))
  }
}

export async function selectRows(table: string, columns: string, userId: string) {
  const { rows } = await pool.query(`select ${columns} from public.${table} where user_id = $1 order by created_at, id`, [userId])
  return { data: rows.map(serialize) }
}

export async function listUsers() {
  const { rows } = await pool.query<{ id: string; email: string }>('select id, email from public."user"')
  return { users: rows }
}

export async function createUser(email: string): Promise<string> {
  await deleteUserByEmail(email)
  const id = `test-${Math.random().toString(36).slice(2)}`
  await pool.query('insert into public."user" (id, name, email, "emailVerified") values ($1, $2, $2, true)', [id, email])
  return id
}

/** Local test runs sign in many times from one IP; start each sign-in with a clean limiter. */
export async function resetRateLimits() {
  await pool.query('delete from public."rateLimit"')
}

export async function deleteUserByEmail(email: string) {
  await pool.query('delete from public."user" where email = $1', [email])
}

/** Runs fn exactly like the app does: transaction, SET LOCAL ROLE app_user, app.user_id set, then commit. */
export async function asUser<T>(userId: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  try {
    await c.query('begin')
    await c.query('set local role app_user')
    if (userId) await c.query("select set_config('app.user_id', $1, true)", [userId])
    const result = await fn(c)
    // COMMIT on an aborted transaction rolls back, which is what a failed statement needs.
    await c.query('commit')
    return result
  } catch (err) {
    await c.query('rollback').catch(() => {})
    throw err
  } finally {
    c.release()
  }
}

/** Runs one statement as a user and returns its rows or the Postgres error code. */
export async function tryAs(userId: string | null, sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; code?: string }> {
  return asUser(userId, async (c) => {
    try {
      const r = await c.query(sql, params)
      return { rows: r.rows }
    } catch (err) {
      return { rows: [], code: (err as { code?: string }).code }
    }
  })
}
