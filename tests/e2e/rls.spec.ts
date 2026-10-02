import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { asUser, createUser, pool, tryAs } from './db'

// Runs SQL exactly as the app's route handlers do (SET LOCAL ROLE app_user +
// app.user_id), so these tests exercise the real policies.

test.describe('row level security', () => {
  test('users only reach their own rows', async () => {
    const a = await createUser('rls-a@example.test')
    const b = await createUser('rls-b@example.test')
    const subjectId = randomUUID()

    const insert = await tryAs(a, 'insert into subjects (id, user_id, name, color_index) values ($1, $2, $3, 1)', [subjectId, a, 'A private'])
    expect(insert.code).toBeUndefined()

    // B cannot see, update, or delete A's subject.
    expect((await tryAs(b, 'select * from subjects where id = $1', [subjectId])).rows).toEqual([])
    expect((await tryAs(b, "update subjects set name = 'hijacked' where id = $1 returning id", [subjectId])).rows).toEqual([])
    expect((await tryAs(b, 'delete from subjects where id = $1', [subjectId])).code).toBe('42501')

    // B cannot insert a row claiming to be A.
    expect((await tryAs(b, 'insert into subjects (id, user_id, name, color_index) values ($1, $2, $3, 0)', [randomUUID(), a, 'forged'])).code).toBe('42501')

    // B cannot overwrite A's row through an upsert on the same id.
    const upsert = await tryAs(b, "insert into subjects (id, user_id, name, color_index) values ($1, $2, 'stolen', 0) on conflict (id) do update set name = excluded.name", [subjectId, b])
    expect(upsert.code).toBe('42501')

    // B cannot attach a session to A's subject (composite foreign key).
    const cross = await tryAs(
      b,
      "insert into sessions (id, user_id, subject_id, started_at, ended_at, duration_seconds, kind) values ($1, $2, $3, now() - interval '1 hour', now(), 3600, 'manual')",
      [randomUUID(), b, subjectId],
    )
    expect(cross.code).toBe('23503')

    // Even the owner cannot hard delete; archive instead.
    expect((await tryAs(a, 'delete from subjects where id = $1', [subjectId])).code).toBe('42501')

    // Without a user id set, nothing is visible.
    expect((await tryAs(null, 'select * from subjects')).rows).toEqual([])

    // A still sees the untouched row.
    expect((await tryAs(a, 'select name from subjects where id = $1', [subjectId])).rows).toEqual([{ name: 'A private' }])
  })

  test('every app table has RLS enabled with policies, and app_user cannot bypass it', async () => {
    const { rows } = await pool.query<{ relname: string; relrowsecurity: boolean; policies: string }>(
      `select c.relname, c.relrowsecurity, count(p.polname)::text as policies
       from pg_class c left join pg_policy p on p.polrelid = c.oid
       where c.relnamespace = 'public'::regnamespace and c.relname in ('subjects','sessions','goals','exams','calendar_sources')
       group by c.relname, c.relrowsecurity order by c.relname`,
    )
    expect(rows).toEqual(
      ['calendar_sources', 'exams', 'goals', 'sessions', 'subjects'].map((relname) => ({ relname, relrowsecurity: true, policies: '3' })),
    )
    const role = await pool.query<{ rolbypassrls: boolean; rolsuper: boolean; rolcanlogin: boolean }>("select rolbypassrls, rolsuper, rolcanlogin from pg_roles where rolname = 'app_user'")
    expect(role.rows).toEqual([{ rolbypassrls: false, rolsuper: false, rolcanlogin: false }])
    // app_user has no access to Better Auth's tables.
    const a = await createUser('rls-c@example.test')
    expect((await tryAs(a, 'select * from "user"')).code).toBe('42501')
    expect((await tryAs(a, 'select * from session')).code).toBe('42501')
  })

  test('last write wins on updated_at, stale writes are ignored', async () => {
    const a = await createUser('lww@example.test')
    const id = randomUUID()
    const t1 = new Date(Date.now() - 60_000).toISOString()
    const t2 = new Date(Date.now() - 30_000).toISOString()
    const upsert = "insert into subjects (id, user_id, name, color_index, updated_at) values ($1, $2, $3, 0, $4) on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at"
    await asUser(a, async (c) => {
      await c.query(upsert, [id, a, 'v1', t1])
      await c.query(upsert, [id, a, 'v2 newer', t2])
      await c.query(upsert, [id, a, 'v0 stale', t1])
      expect((await c.query('select name from subjects where id = $1', [id])).rows).toEqual([{ name: 'v2 newer' }])

      // A device clock far in the future is clamped to server time.
      await c.query(upsert, [id, a, 'future clock', new Date(Date.now() + 86_400_000).toISOString()])
      const r = await c.query<{ updated_at: Date }>('select updated_at from subjects where id = $1', [id])
      expect(r.rows[0]!.updated_at.getTime()).toBeLessThan(Date.now() + 60_000)
    })
  })
})
