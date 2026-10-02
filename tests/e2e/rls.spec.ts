import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { anon, userClient } from './supabase'

test.describe('row level security', () => {
  test('users only reach their own rows', async () => {
    const a = await userClient('rls-a@example.test')
    const b = await userClient('rls-b@example.test')
    const subjectId = randomUUID()

    const insert = await a.client.from('subjects').insert({ id: subjectId, name: 'A private', color_index: 1 })
    expect(insert.error).toBeNull()

    // B cannot see, update, or delete A's subject.
    const read = await b.client.from('subjects').select('*').eq('id', subjectId)
    expect(read.data).toEqual([])
    const upd = await b.client.from('subjects').update({ name: 'hijacked' }).eq('id', subjectId).select()
    expect(upd.data).toEqual([])
    const del = await b.client.from('subjects').delete().eq('id', subjectId)
    expect(del.error?.code).toBe('42501')

    // B cannot insert a row claiming to be A.
    const forged = await b.client.from('subjects').insert({ id: randomUUID(), user_id: a.id, name: 'forged', color_index: 0 })
    expect(forged.error?.code).toBe('42501')

    // B cannot attach a session to A's subject (composite foreign key).
    const cross = await b.client.from('sessions').insert({
      id: randomUUID(),
      subject_id: subjectId,
      started_at: new Date(Date.now() - 3600_000).toISOString(),
      ended_at: new Date().toISOString(),
      duration_seconds: 3600,
      kind: 'manual',
    })
    expect(cross.error?.code).toBe('23503')

    // Even the owner cannot hard delete; archive instead.
    const ownDelete = await a.client.from('subjects').delete().eq('id', subjectId)
    expect(ownDelete.error?.code).toBe('42501')

    // Anonymous requests see nothing.
    const anonRead = await anon().from('subjects').select('*')
    expect(anonRead.error?.code ?? 'no-rows').toMatch(/42501|no-rows/)
    expect(anonRead.data ?? []).toEqual([])

    // A still sees the untouched row.
    const own = await a.client.from('subjects').select('name').eq('id', subjectId).single()
    expect(own.data?.name).toBe('A private')
  })

  test('every table has RLS enabled', async () => {
    const a = await userClient('rls-c@example.test')
    for (const table of ['subjects', 'sessions', 'goals', 'exams', 'calendar_sources'] as const) {
      const { data, error } = await anon().from(table).select('id').limit(1)
      expect(error === null ? data : []).toEqual([])
      const own = await a.client.from(table).select('id')
      expect(own.error).toBeNull()
    }
  })

  test('last write wins on updated_at, stale writes are ignored', async () => {
    const a = await userClient('lww@example.test')
    const id = randomUUID()
    const t1 = new Date(Date.now() - 60_000).toISOString()
    const t2 = new Date(Date.now() - 30_000).toISOString()
    await a.client.from('subjects').upsert({ id, name: 'v1', color_index: 0, updated_at: t1 })
    await a.client.from('subjects').upsert({ id, name: 'v2 newer', color_index: 0, updated_at: t2 })
    const stale = await a.client.from('subjects').upsert({ id, name: 'v0 stale', color_index: 0, updated_at: t1 })
    expect(stale.error).toBeNull()
    const row = await a.client.from('subjects').select('name, updated_at').eq('id', id).single()
    expect(row.data?.name).toBe('v2 newer')

    // A device clock far in the future is clamped to server time.
    const future = new Date(Date.now() + 86_400_000).toISOString()
    await a.client.from('subjects').upsert({ id, name: 'future clock', color_index: 0, updated_at: future })
    const clamped = await a.client.from('subjects').select('updated_at').eq('id', id).single()
    expect(new Date(clamped.data!.updated_at).getTime()).toBeLessThan(Date.now() + 60_000)
  })
})
