import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { deleteUserByEmail, insertRows, listUsers, MAGIC_LINK, MAILPIT, resetRateLimits, selectRows } from './db'


test('signed-out visitors are sent to /login and the API refuses them', async ({ page, request }) => {
  for (const path of ['/', '/history', '/subjects', '/goals', '/stats', '/calendar']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login$/)
  }
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  const res = await request.get(`/api/ics?source=${randomUUID()}&from=2026-10-01T00:00:00Z&to=2026-10-08T00:00:00Z`)
  expect(res.status()).toBe(401)
  expect((await request.get('/api/sync')).status()).toBe(401)
  expect((await request.post('/api/sync', { data: { table: 'subjects', rows: [] } })).status()).toBe(401)
})

test('an invalid or reused magic link shows a clear error', async ({ page }) => {
  await resetRateLimits()
  await page.goto('/api/auth/magic-link/verify?token=not-a-real-token&callbackURL=%2F&errorCallbackURL=%2Flogin')
  await expect(page).toHaveURL(/\/login\?error=/)
  await expect(page.getByText('That link expired or was already used. Send a new one.')).toBeVisible()
})

test('ics route: real auth, RLS lookup, SSRF guard; sign-out clears local data', async ({ page }) => {
  const email = 'ics-route@example.test'
  await deleteUserByEmail(email)
  await resetRateLimits()
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send link' }).click()
  let link: string | undefined
  await expect
    .poll(async () => {
      const list = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()) as { messages: { ID: string }[] }
      if (!list.messages[0]) return false
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json()) as { Text: string }
      link = msg.Text.match(MAGIC_LINK)?.[0]
      return Boolean(link)
    })
    .toBe(true)
  await page.goto(link!)
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  const data = await listUsers()
  const userId = data!.users.find((u) => u.email === email)!.id
  const internal = randomUUID()
  const otherUsers = randomUUID()
  await insertRows('calendar_sources', [{ id: internal, user_id: userId, url: 'https://127.0.0.1/secret.ics' }])
  const other = data!.users.find((u) => u.email !== email)
  if (other) await insertRows('calendar_sources', [{ id: otherUsers, user_id: other.id, url: 'https://example.com/a.ics' }])

  const range = 'from=2026-09-28T00:00:00Z&to=2026-10-05T00:00:00Z'
  const blocked = await page.request.get(`/api/ics?source=${internal}&${range}`)
  expect(blocked.status()).toBe(400)
  expect((await blocked.json()).error).toBe('Calendar host is not a public address.')

  if (other) {
    const notMine = await page.request.get(`/api/ics?source=${otherUsers}&${range}`)
    expect(notMine.status()).toBe(404)
  }
  const badRange = await page.request.get(`/api/ics?source=${internal}&from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z`)
  expect(badRange.status()).toBe(400)

  // /api/sync: only own rows come back; another user's row id cannot be overwritten.
  const foreignSubject = randomUUID()
  if (other) await insertRows('subjects', { id: foreignSubject, user_id: other.id, name: 'Not yours', color_index: 0 })
  const now = new Date().toISOString()
  const push = await page.request.post('/api/sync', {
    headers: { origin: 'http://localhost:3000' },
    data: {
      table: 'subjects',
      rows: [
        { id: foreignSubject, user_id: userId, name: 'Hijack', color_index: 0, weekly_target_minutes: null, archived_at: null, created_at: now, updated_at: now },
        { id: randomUUID(), user_id: 'someone-else', name: 'Mine', color_index: 2, weekly_target_minutes: null, archived_at: null, created_at: now, updated_at: now },
        { id: 'not-a-uuid', name: 'Bad' },
      ],
    },
  })
  expect(push.status()).toBe(200)
  const results = (await push.json()).results as { ok: boolean; code?: string }[]
  expect(results.map((r) => r.ok)).toEqual([!other, true, false])
  if (other) expect(results[0]!.code).toBe('42501')
  const pulled = (await (await page.request.get('/api/sync')).json()) as Record<string, { name?: string; user_id: string }[]>
  expect(pulled.subjects!.map((r) => r.name)).toEqual(['Mine'])
  expect(pulled.subjects!.every((r) => r.user_id === userId)).toBe(true)
  if (other) expect((await selectRows('subjects', 'id, name', other.id)).data.find((r) => r.id === foreignSubject)).toEqual({ id: foreignSubject, name: 'Not yours' })
  const cross = await page.request.post('/api/sync', { headers: { origin: 'https://evil.example' }, data: { table: 'subjects', rows: [] } })
  expect(cross.status()).toBe(403)

  // Sign out clears IndexedDB and the timer.
  await insertRows('subjects', { id: randomUUID(), user_id: userId, name: 'Private subject', color_index: 0 })
  await page.goto('/subjects')
  await expect(page.getByText('Private subject')).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  const rows = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('edu-tracker')
        req.onsuccess = () => {
          const c = req.result.transaction('subjects').objectStore('subjects').count()
          c.onsuccess = () => resolve(c.result)
        }
      }),
  )
  expect(rows).toBe(0)

  // The link was used once; it cannot sign anyone in again.
  await page.goto(link!)
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
