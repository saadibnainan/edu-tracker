// Postgres access for route handlers. Neon in production (DATABASE_URL from the
// Vercel Neon integration), Docker Postgres locally (compose.yaml).

import { Pool, types, type PoolClient } from 'pg'

// DATE columns stay "YYYY-MM-DD" strings; a JS Date would shift them by the server's zone.
types.setTypeParser(1082, (v) => v)

const globalForPool = globalThis as unknown as { __eduPool?: Pool }

export function getPool(): Pool {
  globalForPool.__eduPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
  })
  return globalForPool.__eduPool
}

/**
 * Runs `fn` in a transaction as the restricted `app_user` role with
 * `app.user_id` set, so the RLS policies on every app table apply even though
 * the connection role owns the tables. SET LOCAL keeps this safe behind a
 * transaction-mode pooler (Neon's pooled connection string).
 */
export async function asUser<T>(userId: string, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL ROLE app_user')
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId])
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
