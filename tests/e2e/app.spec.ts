import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { admin, deleteUserByEmail } from './supabase'

const MAILPIT = 'http://127.0.0.1:54324'
const SHOTS = 'design/screenshots/app'
mkdirSync(SHOTS, { recursive: true })

async function signIn(page: Page, email: string): Promise<string> {
  await deleteUserByEmail(email)
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send link' }).click()
  await expect(page.getByText(`Link sent to ${email}`)).toBeVisible()

  let link: string | null = null
  for (let i = 0; i < 40 && !link; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
    const body = (await res.json()) as { messages: { ID: string }[] }
    if (body.messages[0]) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${body.messages[0].ID}`)).json()) as { Text: string }
      link = msg.Text.match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify\?[^\s)]+/)?.[0] ?? null
    }
    if (!link) await new Promise((r) => setTimeout(r, 250))
  }
  expect(link, 'magic link email').not.toBeNull()
  await page.goto(link!)
  await expect(page).toHaveURL('http://localhost:3000/')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
  return data!.users.find((u) => u.email === email)!.id
}

/** Waits until every queued write reached Supabase: outbox empty and status "Synced". */
async function synced(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const req = indexedDB.open('edu-tracker')
              req.onsuccess = () => {
                const db = req.result
                if (!db.objectStoreNames.contains('outbox')) return resolve(-1)
                const count = db.transaction('outbox').objectStore('outbox').count()
                count.onsuccess = () => resolve(count.result)
              }
              req.onerror = () => resolve(-1)
            }),
        ),
      { timeout: 15_000 },
    )
    .toBe(0)
  await expect(page.getByRole('status').filter({ hasText: /Synced \d\d:\d\d/ }).first()).toBeVisible({ timeout: 15_000 })
}

function parseClock(text: string): number {
  const [h, m, s] = text.trim().split(':').map(Number)
  return h! * 3600 + m! * 60 + s!
}

async function seed(userId: string) {
  const db = admin()
  const subjects = [
    { name: 'Linear Algebra', color_index: 0, weekly_target_minutes: 360 },
    { name: 'Organic Chemistry', color_index: 1, weekly_target_minutes: 300 },
    { name: 'Economic History', color_index: 2, weekly_target_minutes: null },
    { name: 'German B2', color_index: 3, weekly_target_minutes: 120 },
    { name: 'Statistics', color_index: 4, weekly_target_minutes: 180 },
  ].map((s) => ({ ...s, id: randomUUID(), user_id: userId }))
  const archived = { id: randomUUID(), user_id: userId, name: 'Physics I', color_index: 5, weekly_target_minutes: null, archived_at: new Date().toISOString() }
  await db.from('subjects').insert([...subjects, archived])

  const sessions = []
  const now = new Date()
  for (let d = 0; d < 30; d++) {
    if (d % 7 === 5) continue
    for (let k = 0; k < 1 + (d % 3); k++) {
      const subject = subjects[(d + k) % subjects.length]!
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, 8 + k * 3, 15)
      const minutes = 25 + ((d * 17 + k * 11) % 70)
      if (start.getTime() + minutes * 60_000 > now.getTime()) continue
      sessions.push({
        id: randomUUID(),
        user_id: userId,
        subject_id: subject.id,
        started_at: start.toISOString(),
        ended_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
        duration_seconds: minutes * 60,
        kind: (['stopwatch', 'pomodoro', 'countdown', 'manual'] as const)[(d + k) % 4] ?? 'manual',
        note: d % 4 === 0 ? 'Eigenvalues and diagonalisation, problem set 4.' : null,
        tags: d % 5 === 0 ? ['exam', 'chapter 3'] : [],
      })
    }
  }
  await db.from('sessions').insert(sessions)
  await db.from('goals').insert([
    { id: randomUUID(), user_id: userId, subject_id: null, period: 'daily', target_minutes: 240 },
    { id: randomUUID(), user_id: userId, subject_id: null, period: 'weekly', target_minutes: 1200 },
    { id: randomUUID(), user_id: userId, subject_id: subjects[0]!.id, period: 'weekly', target_minutes: 360 },
  ])
  const day = (n: number) => {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n)
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }
  await db.from('exams').insert([
    { id: randomUUID(), user_id: userId, subject_id: subjects[0]!.id, exam_date: day(12), title: 'Midterm' },
    { id: randomUUID(), user_id: userId, subject_id: subjects[1]!.id, exam_date: day(1), title: null },
    { id: randomUUID(), user_id: userId, subject_id: subjects[4]!.id, exam_date: day(30), title: 'Final exam' },
  ])
  await db.from('calendar_sources').insert({ id: randomUUID(), user_id: userId, url: 'https://calendar.example.edu/timetable.ics', label: 'University timetable' })
  return subjects
}

/** Stubs /api/ics with lectures in the current week (the route itself is unit tested). */
async function mockIcs(page: Page) {
  await page.route('**/api/ics?*', async (route) => {
    const url = new URL(route.request().url())
    const from = new Date(url.searchParams.get('from')!)
    const at = (day: number, h: number, m = 0) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + day, h, m).toISOString()
    const ymd = (day: number) => {
      const t = new Date(from.getFullYear(), from.getMonth(), from.getDate() + day)
      return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    }
    const events = [
      { uid: '1', summary: 'Linear Algebra lecture', location: 'Room H 1', start: at(0, 10), end: at(0, 11, 30), allDay: false },
      { uid: '2', summary: 'Organic Chemistry lab', location: 'Lab C 204', start: at(1, 14), end: at(1, 17), allDay: false },
      { uid: '3', summary: 'Linear Algebra lecture', location: 'Room H 1', start: at(2, 10), end: at(2, 11, 30), allDay: false },
      { uid: '4', summary: 'Statistics tutorial', location: null, start: at(3, 8, 15), end: at(3, 9, 45), allDay: false },
      { uid: '5', summary: 'German B2 seminar', location: 'Building 3, 112', start: at(4, 12), end: at(4, 13, 30), allDay: false },
      { uid: '6', summary: 'Public holiday', location: null, start: ymd(5), end: ymd(6), allDay: true },
    ]
    await route.fulfill({ json: { events } })
  })
}

test.describe.configure({ mode: 'serial' })

test('timer survives reload and tab close, saves a session with a note', async ({ page }) => {
  const userId = await signIn(page, 'timer@example.test')
  const subjectId = randomUUID()
  await admin().from('subjects').insert({ id: subjectId, user_id: userId, name: 'Linear Algebra', color_index: 0 })
  await page.reload()
  await synced(page)

  // Start, then reload: the display continues from the stored start timestamp.
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  await page.waitForTimeout(2200)
  const before = parseClock(await page.getByRole('timer').innerText())
  expect(before).toBeGreaterThanOrEqual(2)
  await page.reload()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  await expect.poll(async () => parseClock(await page.getByRole('timer').innerText())).toBeGreaterThanOrEqual(before + 1)
  await expect.poll(() => page.title()).toMatch(/^00:0\d Linear Algebra$/)

  // Simulate a tab closed 25 minutes ago: rewrite the stored start time, then reopen.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('edu.timer.v1')!)
    s.segmentStartedAt -= 25 * 60_000
    s.firstStartedAt -= 25 * 60_000
    localStorage.setItem('edu.timer.v1', JSON.stringify(s))
  })
  await page.close()
  const page2 = await page.context().newPage()
  await page2.goto('/')
  await expect.poll(async () => parseClock(await page2.getByRole('timer').innerText())).toBeGreaterThanOrEqual(25 * 60)
  await expect.poll(() => page2.title()).toMatch(/^25:0\d Linear Algebra$/)

  // Pause freezes the clock.
  await page2.getByRole('button', { name: 'Pause', exact: true }).click()
  const paused = await page2.getByRole('timer').innerText()
  await page2.waitForTimeout(1500)
  expect(await page2.getByRole('timer').innerText()).toBe(paused)
  await expect.poll(() => page2.title()).toMatch(/^Paused 25:0\d Linear Algebra$/)

  // Stop saves the session and offers a note.
  await page2.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page2.getByText(/Session saved, 0:25/)).toBeVisible()
  await page2.getByRole('textbox', { name: 'Note', exact: true }).fill('Gram-Schmidt and QR decomposition')
  await page2.getByLabel('Tags, comma separated').fill('Exam, chapter 5')
  await page2.getByRole('button', { name: 'Save note' }).click()
  await expect.poll(() => page2.title()).toBe('Dashboard, EDU-Tracker')
  await synced(page2)

  const { data } = await admin().from('sessions').select('*').eq('user_id', userId)
  expect(data).toHaveLength(1)
  expect(data![0]).toMatchObject({ kind: 'stopwatch', note: 'Gram-Schmidt and QR decomposition', tags: ['exam', 'chapter 5'] })
  expect(data![0]!.duration_seconds).toBeGreaterThanOrEqual(25 * 60)
  expect(data![0]!.duration_seconds).toBeLessThan(26 * 60)
})

test('keyboard shortcuts: Space starts and pauses, S stops', async ({ page }) => {
  const userId = await signIn(page, 'keys@example.test')
  await admin().from('subjects').insert({ id: randomUUID(), user_id: userId, name: 'Statistics', color_index: 4 })
  await page.reload()
  await synced(page)
  await page.getByRole('heading', { name: 'Dashboard', level: 1 }).click()
  await page.keyboard.press('Space')
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByText('Paused', { exact: true })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  // Keys pressed while a control has focus belong to that control.
  await page.getByRole('button', { name: 'Pause', exact: true }).focus()
  await page.keyboard.press('s')
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  await page.getByRole('heading', { name: 'Dashboard', level: 1 }).click()
  await page.keyboard.press('s')
  await expect(page.getByText('Under a minute, not saved.')).toBeVisible()
})

test('pomodoro: a finished focus phase saves a session and starts the break', async ({ page }) => {
  const userId = await signIn(page, 'pomo@example.test')
  const subjectId = randomUUID()
  await admin().from('subjects').insert({ id: subjectId, user_id: userId, name: 'German B2', color_index: 3 })
  // Focus phase of 25 min that started 26 min ago, as if the tab slept through the end.
  await page.evaluate((subjectId) => {
    const now = Date.now()
    localStorage.setItem(
      'edu.timer.v1',
      JSON.stringify({
        status: 'running', mode: 'pomodoro', subjectId, sessionId: crypto.randomUUID(), segmentStartedAt: now - 26 * 60_000,
        accumulatedMs: 0, firstStartedAt: now - 26 * 60_000, countdownMs: 1_500_000, phase: 'focus', completedFocus: 0,
      }),
    )
  }, subjectId)
  await page.reload()
  await expect(page.getByText('Break', { exact: true })).toBeVisible()
  await expect(page.getByText('Short break')).toBeVisible()
  await expect(page.getByText(/Session saved, 0:25/)).toBeVisible()
  await expect.poll(() => page.title()).toMatch(/^Break 0[34]:\d\d German B2$/)
  await synced(page)
  const { data } = await admin().from('sessions').select('kind, duration_seconds').eq('user_id', userId)
  expect(data).toEqual([{ kind: 'pomodoro', duration_seconds: 1500 }])
})

test('history: manual entry, search, edit, delete', async ({ page }) => {
  const userId = await signIn(page, 'history@example.test')
  await admin().from('subjects').insert({ id: randomUUID(), user_id: userId, name: 'Economic History', color_index: 2 })
  await page.goto('/history')
  await synced(page)
  await expect(page.getByText('No sessions yet. Start a timer to log one.')).toBeVisible()

  const y = new Date(Date.now() - 86_400_000)
  const d = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
  await page.getByLabel('Start').fill(`${d}T09:00`)
  await page.getByLabel('End').fill(`${d}T10:30`)
  await page.getByRole('textbox', { name: 'Note', exact: true }).first().fill('Industrial revolution reading')
  await page.getByLabel('Tags, comma separated').first().fill('reading')
  await page.getByRole('button', { name: 'Add session' }).click()
  // The form resets after a successful add, so the same entry is not added twice.
  await expect(page.getByRole('textbox', { name: 'Note', exact: true }).first()).toHaveValue('')
  await expect(page.getByText('Industrial revolution reading')).toBeVisible()
  await expect(page.getByText('1 found')).toBeVisible()

  await page.getByLabel('Search notes, tags, subjects').fill('nothing-matches-this')
  await expect(page.getByText('No sessions match. Try another word or subject.')).toBeVisible()
  await page.getByLabel('Search notes, tags, subjects').fill('#reading')
  await expect(page.getByText('1 found')).toBeVisible()

  const list = page.getByRole('region', { name: '02 Sessions' })
  await list.getByRole('button', { name: /Edit session/ }).click()
  await list.getByLabel('Studied, min').fill('75')
  await list.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(list.getByText('1:15', { exact: true }).first()).toBeVisible()

  await list.getByRole('button', { name: /Edit session/ }).click()
  await list.getByRole('button', { name: 'Delete' }).click()
  await expect(list.getByText('Delete this session?')).toBeVisible()
  await list.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('No sessions yet. Start a timer to log one.')).toBeVisible()
  await synced(page)
  const { data } = await admin().from('sessions').select('duration_seconds, deleted_at').eq('user_id', userId)
  expect(data).toHaveLength(1)
  expect(data![0]!.duration_seconds).toBe(4500)
  expect(data![0]!.deleted_at).not.toBeNull()
})

test('offline: writes queue in IndexedDB and sync on reconnect', async ({ page, context }) => {
  const userId = await signIn(page, 'offline@example.test')
  await synced(page)
  // Wait until the service worker controls the page and has cached the app pages.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await expect
    .poll(async () => page.evaluate(async () => (await (await caches.open('edu-pages-v1')).keys()).length), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(6)

  await context.setOffline(true)
  await page.goto('/subjects')
  await expect(page.getByRole('heading', { name: 'Subjects', level: 1 })).toBeVisible()
  await page.getByLabel('Name').fill('Offline subject')
  await page.getByRole('button', { name: 'Add subject' }).click()
  await expect(page.getByText('Offline. 1 write queued.')).toBeVisible()

  // Timer works offline too.
  await page.goto('/')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('edu.timer.v1')!)
    s.segmentStartedAt -= 10 * 60_000
    s.firstStartedAt -= 10 * 60_000
    localStorage.setItem('edu.timer.v1', JSON.stringify(s))
  })
  await page.reload()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByText('Offline. 2 writes queued.')).toBeVisible()
  let remote = await admin().from('subjects').select('name').eq('user_id', userId)
  expect(remote.data).toEqual([])

  await context.setOffline(false)
  await synced(page)
  remote = await admin().from('subjects').select('name').eq('user_id', userId)
  expect(remote.data).toEqual([{ name: 'Offline subject' }])
  const sessions = await admin().from('sessions').select('duration_seconds').eq('user_id', userId)
  expect(sessions.data).toHaveLength(1)
})

test('goals, exams and calendar', async ({ page }) => {
  const userId = await signIn(page, 'goals@example.test')
  await admin().from('subjects').insert({ id: randomUUID(), user_id: userId, name: 'Statistics', color_index: 4 })
  await mockIcs(page)
  await page.goto('/goals')
  await synced(page)
  await page.getByLabel('Target, hours').fill('2:30')
  await page.getByRole('button', { name: 'Set goal' }).click()
  await expect(page.getByText('0:00 / 2:30')).toBeVisible()
  // Same scope and period updates the goal instead of duplicating it.
  await page.getByLabel('Target, hours').fill('3')
  await page.getByRole('button', { name: 'Update goal' }).click()
  await expect(page.getByText('0:00 / 3:00')).toBeVisible()
  await expect(page.getByText('0:00 / 2:30')).toHaveCount(0)

  await page.goto('/calendar')
  await page.getByLabel('.ics subscription link').fill('http://insecure.example/cal.ics')
  await page.getByRole('button', { name: 'Add calendar' }).click()
  await expect(page.getByText('Paste an https:// or webcal:// link to an .ics calendar.')).toBeVisible()
  await page.getByLabel('.ics subscription link').fill('webcal://calendar.example.edu/timetable.ics')
  await page.getByRole('button', { name: 'Add calendar' }).click()
  await expect(page.getByText('Organic Chemistry lab')).toBeVisible()
  await expect(page.getByText('All day')).toBeVisible()

  const t = new Date(Date.now() + 5 * 86_400_000)
  await page.getByLabel('Date').fill(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`)
  await page.getByLabel('Title').fill('Stats quiz')
  await page.getByRole('button', { name: 'Add exam' }).click()
  await expect(page.getByText('5 days')).toBeVisible()
  await page.goto('/')
  await expect(page.getByText('Stats quiz')).toBeVisible()
  await expect(page.getByText('Statistics tutorial')).toBeVisible()
  await synced(page)
  const src = await admin().from('calendar_sources').select('url').eq('user_id', userId)
  expect(src.data).toEqual([{ url: 'https://calendar.example.edu/timetable.ics' }])
  const goals = await admin().from('goals').select('target_minutes').eq('user_id', userId)
  expect(goals.data).toEqual([{ target_minutes: 180 }])
})

test('screenshots of every screen at 375 and 1440', async ({ page, browser }) => {
  // Signed out
  const anonCtx = await browser.newContext({ timezoneId: 'Europe/Berlin' })
  const anonPage = await anonCtx.newPage()
  for (const width of [375, 1440]) {
    await anonPage.setViewportSize({ width, height: width === 375 ? 812 : 900 })
    await anonPage.goto('/login')
    await anonPage.screenshot({ path: `${SHOTS}/login-${width}.png`, fullPage: true })
  }
  await anonCtx.close()

  const userId = await signIn(page, 'screens@example.test')
  await page.setViewportSize({ width: 1440, height: 900 })
  await synced(page)
  await page.screenshot({ path: `${SHOTS}/dashboard-empty-1440.png`, fullPage: true })
  const subjects = await seed(userId)
  await mockIcs(page)
  await page.reload()
  await synced(page)

  // A running timer for the dashboard shots.
  await page.evaluate((subjectId) => {
    const now = Date.now()
    localStorage.setItem(
      'edu.timer.v1',
      JSON.stringify({
        status: 'running', mode: 'stopwatch', subjectId, sessionId: crypto.randomUUID(), segmentStartedAt: now - 5_047_000,
        accumulatedMs: 0, firstStartedAt: now - 5_047_000, countdownMs: 1_500_000, phase: 'focus', completedFocus: 0,
      }),
    )
  }, subjects[0]!.id)

  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 })
    for (const [name, path] of [
      ['dashboard', '/'],
      ['history', '/history'],
      ['subjects', '/subjects'],
      ['goals', '/goals'],
      ['stats', '/stats'],
      ['calendar', '/calendar'],
    ] as const) {
      await page.goto(path)
      await synced(page)
      if (name === 'dashboard' || name === 'calendar') await expect(page.getByText('Organic Chemistry lab')).toBeVisible()
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${SHOTS}/${name}-${width}.png`, fullPage: true })
    }
  }

  // Interaction states: hover inversion on a subject row and keyboard focus.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/subjects')
  await synced(page)
  await page.getByText('Organic Chemistry').first().hover()
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${SHOTS}/state-hover-1440.png`, clip: { x: 0, y: 0, width: 1440, height: 600 } })
  await page.goto('/')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.screenshot({ path: `${SHOTS}/state-focus-1440.png`, clip: { x: 0, y: 0, width: 1440, height: 400 } })
})
