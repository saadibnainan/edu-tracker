import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { admin, deleteUserByEmail } from './supabase'

const MAILPIT = 'http://127.0.0.1:54324'

test('signed-out visitors are sent to /login and the API refuses them', async ({ page, request }) => {
  for (const path of ['/', '/history', '/subjects', '/goals', '/stats', '/calendar']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login$/)
  }
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  const res = await request.get(`/api/ics?source=${randomUUID()}&from=2026-10-01T00:00:00Z&to=2026-10-08T00:00:00Z`)
  expect(res.status()).toBe(401)
})

test('an invalid or reused magic link shows a clear error', async ({ page }) => {
  await page.goto('/auth/confirm?code=not-a-real-code')
  await expect(page).toHaveURL(/\/login\?error=link$/)
  await expect(page.getByText('That link expired or was already used. Send a new one.')).toBeVisible()
})

test('ics route: real auth, RLS lookup, SSRF guard; sign-out clears local data', async ({ page }) => {
  const email = 'ics-route@example.test'
  await deleteUserByEmail(email)
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
      link = msg.Text.match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify\?[^\s)]+/)?.[0]
      return Boolean(link)
    })
    .toBe(true)
  await page.goto(link!)
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
  const userId = data!.users.find((u) => u.email === email)!.id
  const internal = randomUUID()
  const otherUsers = randomUUID()
  await admin().from('calendar_sources').insert([{ id: internal, user_id: userId, url: 'https://127.0.0.1/secret.ics' }])
  const other = data!.users.find((u) => u.email !== email)
  if (other) await admin().from('calendar_sources').insert([{ id: otherUsers, user_id: other.id, url: 'https://example.com/a.ics' }])

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

  // Sign out clears IndexedDB and the timer.
  await admin().from('subjects').insert({ id: randomUUID(), user_id: userId, name: 'Private subject', color_index: 0 })
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
