# EDU-Tracker plan

Study tracker. Next.js App Router + TypeScript strict + Tailwind CSS + Neon Postgres (via the Vercel Marketplace) + Better Auth + Resend. Deployed on Vercel. Switched from Supabase at your request after phase 6; the Supabase files and packages were removed. Multi-user, email magic link, data synced across devices, works offline. Visual rules live in `STYLE.md`.

## 1. Decisions

| Topic | Decision |
|---|---|
| Users | Multi-user. Anyone can sign in with a magic link (Better Auth magic-link plugin, emails via Resend). Every row carries `user_id`. RLS restricts each user to their own rows. |
| Data flow | Offline-first. UI reads and writes a local IndexedDB store. A sync engine pushes an outbox to `/api/sync` and pulls remote rows from it. The browser never talks to the database directly. Server components only do the auth gate and the shell. |
| Database access | Route handlers use `pg` with a small pool. Every data query runs in a transaction that does `SET LOCAL ROLE app_user` and sets `app.user_id`, so Postgres RLS applies even on Neon, where the connection role can bypass RLS. |
| Conflicts | Last write wins on `updated_at`, enforced in Postgres by a trigger. |
| Time zone | All timestamps stored as `timestamptz` (UTC). Day and week boundaries computed in the browser's local zone. Weeks start Monday (ISO 8601). |
| Streak | A day counts when its total is at least 30 minutes. The streak is the run of consecutive counting days ending today, or ending yesterday if today has not reached 30 minutes yet. |
| Chart library | **Chart.js 4**, tree-shaken to the bar controller: per-bar color arrays (accent for the current day), `borderRadius: 0`, full control of fonts and gridlines, no plugins. |
| Fonts | IBM Plex Sans and Mono via `next/font/google` (self-hosted at build time). |
| Icons | `lucide-react`, 16px, stroke 1.5. |

## 2. Versions

Checked on 2026-10-02 against the npm registry (`npm view <pkg> version`) and the official docs.

| Package | Version | Source / note |
|---|---|---|
| next | 16.3.8 | nextjs.org/docs installation page shows `version: 16.3.8`. Requires Node ≥ 20.9 (local: 26.10.0). |
| react, react-dom | 19.3.0 | npm |
| typescript | 7.0.2 as `tsc` (`@typescript/native`), 6.0.2 API as `typescript` | Resolved. Next 16.3.8 runs the project-local `tsc` CLI and supports TS 7 (bundled docs, `useTypeScriptCli`). typescript-eslint cannot load TS 7 ("does not support TS 7.0"), so per the TypeScript 7 announcement the TS 6 API is installed side by side: `"@typescript/native": "npm:typescript@7.0.2"`, `"typescript": "npm:@typescript/typescript6@6.0.2"`. |
| tailwindcss, @tailwindcss/postcss, postcss | 4.3.3 | tailwindcss.com Next guide: `npm install tailwindcss @tailwindcss/postcss postcss`, `postcss.config.mjs` with `"@tailwindcss/postcss"`, `@import "tailwindcss";` |
| better-auth | 1.7.7 | better-auth.com docs: `toNextJsHandler`, `nextCookies()`, `getSessionCookie` for `proxy.ts`, magic-link plugin, `pg` Pool as database. Schema generated with `npx auth@1.7.7 generate`. |
| resend | 6.32.0 | npm. Sends the magic-link email in production. |
| pg, @types/pg | 8.23.1 | npm. Plain Postgres driver: talks to Neon in production and to Docker Postgres locally without Neon's local proxy. |
| lucide-react | 1.49.0 | npm |
| chart.js | 4.5.1 | npm |
| eslint, eslint-config-next | 9.39.5, 16.3.8 | ESLint 10.11.0 crashes in eslint-plugin-react 7.37.5 (bundled by eslint-config-next; peer range ends at ESLint 9.7+, `context.getFilename is not a function`). Pinned to the newest 9.x. `npm run lint` calls `eslint` directly. |
| vitest | 5.0.3 | pre-approved dev dependency |
| @playwright/test | 1.63.0 | pre-approved dev dependency |

Framework facts confirmed in the Next 16.3.8 docs:
- `middleware.ts` is deprecated and renamed to `proxy.ts` (export `proxy`, Node runtime by default).
- `next build` does not lint.
- Metadata file conventions: `app/icon.svg`, `app/apple-icon.png`, `app/favicon.ico`, `app/manifest.ts`.

## 3. Dependencies

Named in the spec, so installed without asking: next, react, react-dom, typescript, tailwindcss (+ @tailwindcss/postcss, postcss), lucide-react, chart.js, eslint + eslint-config-next (the linter the spec requires), vitest, @playwright/test.

**Approved by you after phase 1** (not named in the spec):

| Package | Why | Alternative if declined |
|---|---|---|
| `better-auth`, `resend`, `pg` (approved with the switch to Neon) | Auth with magic links, email delivery, Postgres driver. | Neon Auth (managed Better Auth): magic-link support could not be confirmed in its docs. |
| `ical.js` 2.2.1 (approved) | Correct RRULE, EXDATE and VTIMEZONE expansion. University timetables are almost all recurring events. | Hand-written parser covering VEVENT, DTSTART/DTEND, simple weekly RRULE. Will miss edge cases. |

Deliberately **not** added: no PWA plugin (hand-written `public/sw.js`), no `idb` wrapper (raw IndexedDB), no component library, no date library (Intl + small helpers), no state library.

## 4. Folder structure

```
app/
  layout.tsx               root html, fonts, metadata, SW registration
  globals.css              Tailwind import + tokens from STYLE.md
  manifest.ts              web manifest
  icon.svg                 favicon (chosen concept)
  favicon.ico              16/32/48, generated
  apple-icon.png           180, generated
  (app)/                   signed-in shell: sidebar + content grid
    layout.tsx
    page.tsx               dashboard
    history/page.tsx
    subjects/page.tsx
    goals/page.tsx
    stats/page.tsx
    calendar/page.tsx
  login/page.tsx
  api/auth/[...all]/route.ts  Better Auth (magic link send + verify, session, sign-out)
  api/sync/route.ts        GET all of the user's rows, POST outbox batches
  api/ics/route.ts         server-side .ics fetch + parse
components/                cells, buttons, timer, list rows, chart wrapper
lib/
  auth.ts, auth-client.ts  Better Auth server config and browser client
  server/                  pg pool + asUser(), session helper, mailer, row validation
  db/                      IndexedDB store, outbox, sync engine
  timer/                   pure elapsed-time math, pomodoro state machine
  stats/                   totals, per-subject, daily series, streak
  ics/                     parse + expand to week, SSRF guard
  format.ts                H:MM, HH:MM:SS
proxy.ts                   redirect to /login when there is no session cookie
public/
  sw.js                    service worker
  icons/                   icon-192.png, icon-512.png, icon-maskable-512.png (generated)
scripts/
  build-icons.mjs          `npm run icons`: SVG -> all rasters + ICO
db/migrations/             0001_auth.sql (Better Auth), 0002_app.sql (app tables, role, RLS)
scripts/migrate.mjs        `npm run db:migrate`
compose.yaml               local Postgres 17 + Mailpit
tests/
  unit/                    Vitest
  e2e/                     Playwright (screenshots, reload check, icon 200 checks)
  fixtures/                .ics samples
design/                    contrast script, mockups, favicon concepts and source
```

## 5. Schema

Every table: `id uuid primary key` (generated on the client so offline rows have stable ids, `default gen_random_uuid()` as fallback), `user_id text not null default current_app_user() references "user" (id) on delete cascade` (Better Auth user ids are text), `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.

```
subjects
  name                    text not null, 1..80 chars
  color_index             smallint not null, 0..5
  weekly_target_minutes   int null, > 0
  archived_at             timestamptz null          -- archive instead of delete
  unique (id, user_id)                               -- target for composite FKs

sessions
  subject_id              uuid not null
  started_at              timestamptz not null
  ended_at                timestamptz not null, >= started_at
  duration_seconds        int not null, >= 0         -- excludes pauses
  kind                    text not null in ('stopwatch','countdown','pomodoro','manual')
  note                    text null, <= 2000 chars
  tags                    text[] not null default '{}'
  deleted_at              timestamptz null           -- tombstone (approved after phase 1)
  foreign key (subject_id, user_id) references subjects (id, user_id)
  index (user_id, started_at desc), gin (tags)

goals
  subject_id              uuid null                  -- null = global goal
  period                  text not null in ('daily','weekly')
  target_minutes          int not null, > 0
  deleted_at              timestamptz null           -- tombstone so removal syncs offline
  unique nulls not distinct (user_id, subject_id, period) where deleted_at is null
  id = deterministic UUID of (user, subject or global, period), so two offline devices
       creating the same goal write the same row instead of colliding
  foreign key (subject_id, user_id) references subjects (id, user_id)

exams
  subject_id              uuid not null
  exam_date               date not null
  title                   text null
  deleted_at              timestamptz null
  foreign key (subject_id, user_id) references subjects (id, user_id)

calendar_sources
  url                     text not null, must start with https:// (webcal:// rewritten on input)
  label                   text null
  deleted_at              timestamptz null
```

Notes:
- The composite foreign keys stop a user from attaching a session, goal or exam to another user's subject id. RLS alone would not.
- Tombstones (`deleted_at`) on sessions, goals, exams and calendar_sources make removal work offline and sync with last-write-wins. No table gets a DELETE policy, so nothing is hard-deleted from the client.

**Last-write-wins trigger** (one function, attached to all 5 tables, `BEFORE UPDATE`):
- if `NEW.updated_at < OLD.updated_at`, return `NULL` (the stale write is skipped silently, the upsert still succeeds);
- if `NEW.updated_at > now() + interval '5 minutes'`, clamp to `now()` so one device with a fast clock cannot win every future conflict;
- `NEW.user_id` and `NEW.created_at` are forced to the old values.

**RLS**, enabled on all 5 tables. Role `app_user` (NOLOGIN, no BYPASSRLS) gets select, insert, update on the five tables and nothing on Better Auth's tables. For each table: `select`, `insert`, `update` policies `to app_user` with `using (user_id = current_app_user())` and `with check (user_id = current_app_user())`, where `current_app_user()` reads the transaction-local `app.user_id`. No delete grant or policy. Without `app.user_id` set, nothing is visible.

Migrations: `db/migrations/*.sql`, applied by `npm run db:migrate` (tracked in `_migrations`). Applied only to the local Docker database by me; you run it against Neon.

## 6. Routes

| Route | Type | Content |
|---|---|---|
| `/` | page | 01 Timer (stopwatch, countdown, pomodoro with inline config), 02 Today (totals + goal bars), 03 Exams (countdowns), 04 This week (ICS schedule) |
| `/history` | page | search (note text, tags, subject), edit session note/tags/times, manual entry |
| `/subjects` | page | list, create, edit, archive / unarchive |
| `/goals` | page | daily and weekly goals, global and per subject |
| `/stats` | page | today / week / month totals, per-subject breakdown, daily bar chart, streak |
| `/calendar` | page | ICS URLs, this week's schedule, exams list and entry |
| `/login` | page | email field, "Send link" |
| `/api/auth/*` | route handler | Better Auth: `/sign-in/magic-link`, `/magic-link/verify`, `/get-session`, `/sign-out` |
| `/api/sync` | route handler | GET: the user's rows per table. POST `{ table, rows }`: per-row upsert in savepoints, returns per-row results. Same-origin only. |
| `/api/ics?source=<id>` | route handler | fetch + parse, see section 9 |
| `/manifest.webmanifest`, `/icon.svg`, `/favicon.ico`, `/apple-icon.png`, `/icons/*` | static/metadata | icons and manifest |

`proxy.ts` redirects requests without a session cookie to `/login` (`getSessionCookie`, an optimistic check). Its matcher excludes `/api/`, `_next/static`, `_next/image`, icons, manifest and `sw.js`. The app layout and every route handler verify the session with `auth.api.getSession`. Route handlers and server code check auth again themselves, as the Next docs recommend.

## 7. Timer and pomodoro

Running timer state lives in `localStorage` (per device), so it survives refresh, tab sleep and tab close:

```
{ subjectId, mode: 'stopwatch'|'countdown'|'pomodoro',
  segmentStartedAt: epoch ms | null,   // null while paused
  accumulatedMs,                       // finished segments
  firstStartedAt,                      // session started_at
  countdownMs | pomodoro: { phase, cycle, config } }
```

- `elapsed(state, now) = accumulatedMs + (segmentStartedAt ? now - segmentStartedAt : 0)`. Countdown remaining = `max(0, countdownMs - elapsed)`. Pure functions, unit tested, never accumulated tick by tick.
- The display ticks with `requestAnimationFrame`-aligned 1s updates; the value is always recomputed from `Date.now()`.
- Document title while running: `24:07 Linear Algebra` (remaining for countdown and pomodoro, elapsed for stopwatch). Restored on stop.
- Stop writes one `sessions` row through the local store (works offline) and opens the note/tags form.
- Pomodoro config (focus, short break, long break, cycles before long break) is stored per device in `localStorage`, because the five-table schema has no settings table. Defaults 25 / 5 / 15 / 4.
- Phase end: Notification API (permission requested on first pomodoro start, never on page load) plus a short tone generated with Web Audio (no audio file), unlocked by the Start click. A dedicated Web Worker checks phase end every second so hidden-tab timer throttling does not delay it. Each completed focus phase saves a session with `kind = 'pomodoro'`.
- Phase ends use exact timestamps: a finished focus phase saves its session and starts the break at the moment focus ended. A finished break waits for Start, so a tab closed for hours cannot produce a chain of phantom focus sessions.
- Stop saves the time studied in every mode (including a partial pomodoro focus) when it is at least one minute; shorter runs show "Under a minute, not saved."
- Each run gets its session id at Start. Two open tabs that both notice a phase end upsert the same row instead of creating duplicates.
- Shortcuts: Space = start/pause, S = stop. Ignored while focus is in an input, textarea or contenteditable.
- Multiple tabs: a `storage` event keeps every open tab in step.

## 8. Offline sync

```
UI ──write──> IndexedDB table store ──> outbox (seq, table, id, row)
 ^                                            │ flush: online, visibilitychange,
 │                                            │ app start, every 30 s, after each write
 └──read── IndexedDB <──pull── /api/sync <────┘ POST { table, rows } -> per-row results
```

- IndexedDB database `edu-tracker`, stores: `subjects`, `sessions`, `goals`, `exams`, `calendar_sources`, `outbox`, `meta`, `ics_cache`.
- Every write sets `updated_at = new Date().toISOString()`, puts the row locally, appends to the outbox (coalesced per `table + id`), then tries to flush.
- Flush: per table, batches of up to 200 rows to `POST /api/sync`. Rows the server stored leave the outbox; rows it rejected (RLS, constraint, validation) move to a `failed` list shown in the sidebar footer ("1 write failed"). Network errors, 401, 429 and 5xx back off exponentially (2 s to 60 s).
- Pull after every successful flush and on reconnect: fetch all of the user's rows per table (expected volume is a few thousand rows per year) and replace local rows unless the local row has a pending outbox entry, or has a newer `updated_at`. A full pull avoids missing rows that another device wrote with an older client clock.
- `navigator.locks.request('edu-sync')` ensures only one tab flushes at a time. `BroadcastChannel('edu-sync')` tells other tabs to re-read.
- Sign-out clears IndexedDB and localStorage so the next account starts clean.
- Sidebar footer shows sync state: "Synced 14:02", "Offline. 2 writes queued.", "1 write failed".

**Service worker** (`public/sw.js`, hand-written, registered in production only):
- `/_next/static/*`: cache-first (file names are content-hashed).
- Navigations: network-first with a 3 s timeout, falling back to the last cached HTML for that route, then to the cached `/`.
- Icons, manifest, fonts: stale-while-revalidate.
- `/api/*`: never cached by the SW (data goes through IndexedDB).
- After sign-in, the page posts the route list to the SW, which fetches each route's HTML and caches the `/_next/static` assets it references, so pages never visited online still open offline.
- Cache name carries a version; `activate` deletes old caches.

## 9. Calendar (.ics) route handler

`GET /api/ics?source=<uuid>`, Node runtime:
1. `auth.api.getSession`; 401 if signed out.
2. Load the `calendar_sources` row inside `asUser()` (RLS applies). 404 if missing or another user's.
3. SSRF guard: only `https:`; resolve DNS and reject loopback, private, link-local, CGNAT and metadata ranges (IPv4 and IPv6); follow at most 3 redirects manually, re-checking each hop.
4. Fetch with 8 s timeout and 2 MB cap; require `BEGIN:VCALENDAR`.
5. Parse and expand recurring events into the current Monday to Sunday window in the user's zone (zone passed as `tz` query param).
6. Return `[{ uid, start, end, allDay, summary, location }]`, `Cache-Control: private, max-age=900`.
7. The URL is never logged (subscription URLs usually embed a secret token).

The client caches the last response in `ics_cache` so the week view works offline.

## 10. Icons and PWA

- Source of truth: `design/favicon.svg` (concept A, copied to `app/icon.svg`).
- `npm run icons` runs `scripts/build-icons.mjs`: Playwright's Chromium (pre-approved) draws the SVG on a canvas at 16, 32, 48, 180, 192, 512, plus a maskable 512 with the mark at 288 px (fits the 40%-radius safe circle) on a full #0C0C0C bleed. A small encoder (`node:zlib`) writes 8-bit RGBA PNGs, because ICO entries must be RGBA and Chromium's own encoder drops the alpha channel for opaque images. 16/32/48 are packed into `app/favicon.ico`. Outputs are committed. No new dependency.
- `app/manifest.ts`: name "EDU-Tracker", short_name "EDU-Tracker", `display: standalone`, `start_url: /`, `theme_color` and `background_color` `#0C0C0C`, icons 192, 512, maskable 512.
- Phase 2 scaffolds by hand (the "Manual installation" path in the Next docs) instead of `create-next-app`, so the default Next/Vercel assets (`public/*.svg`, default `favicon.ico`, sample page) are never created and nothing has to be deleted. A Playwright check asserts the build output contains no `next.svg`, `vercel.svg`, `file.svg`, `globe.svg` or `window.svg`.

## 11. Verification per phase

- `npm run build`, `npm run lint`, `npm run typecheck` (`tsc --noEmit`), `npm test` (Vitest). Real output quoted in each report.
- Unit tests: elapsed-time math (pause/resume, refresh mid-segment, countdown clamp), streak (gaps, 30-minute threshold, today not yet met, midnight-spanning sessions, DST change), ICS parsing (fixtures with RRULE, EXDATE, all-day, TZID).
- Playwright against `next start` + local Postgres and Mailpit (compose.yaml): screenshot every screen at 375 and 1440, view them, compare to `STYLE.md`. Reload test: start timer, wait, reload, assert displayed time ≥ elapsed.
- From phase 2: `curl -I` every icon path and the manifest (HTTP 200), manifest JSON validated against required fields.

## 12. Risks and open questions

1. **Approvals**: `ical.js` approved after phase 1; `better-auth`, `resend`, `pg` approved with the switch to Neon. The `supabase` CLI and `@supabase/*` packages were removed.
2. **TypeScript 7**: resolved, see section 2. Revisit when typescript-eslint supports TS 7 (then drop the TS 6 alias).
3. **Session deletion**: resolved. Sessions have a `deleted_at` tombstone (approved after phase 1). Delete in History asks for confirmation.
4. **Pomodoro settings and the running timer are per device**, not synced, because they are not in the five tables. A timer started on the laptop does not appear on the phone until it is stopped and saved.
5. **Hidden-tab throttling** could delay phase-end alerts; mitigated with a Web Worker. Notifications need permission and do not fire if the browser is fully closed (no push server in scope).
6. **Service worker and hashed assets**: routes never visited online need the warm-up step in section 8; the first offline load after a deploy uses the previous build's cached shell.
7. **ICS fetch** is an SSRF surface; guarded as in section 9. Some providers block datacenter IPs or rate-limit, which surfaces as "Calendar could not be loaded."
8. **Clock skew** between devices can make last-write-wins pick the older edit; the 5-minute future clamp limits the damage.
9. **Magic links on iOS PWA** open in Safari, not in the installed app; the session cookie is then not shared with the standalone app. The user may need to sign in from inside the installed app once. Known iOS platform limit.
10. **Disabled text** contrast is below 4.5:1 by design (exempt), see `STYLE.md`.
11. **Rate limits** live in the `rateLimit` table (serverless instances share no memory): 20 magic-link requests and 60 verifications per minute per IP.
12. **Connection pooling**: use Neon's pooled `DATABASE_URL` at runtime; `SET LOCAL` keeps the per-transaction role safe behind a transaction-mode pooler. Migrations use `DATABASE_URL_UNPOOLED`.

## 13. Phases

1. PLAN.md, STYLE.md, style mockup + screenshots, 3 favicon concepts. Concept A (quadrant) chosen.
2. Scaffold, auth, schema + RLS, subjects, chosen favicon wired in with all sizes.
3. Timer, pomodoro, sessions, notes.
4. Goals, stats, streaks.
5. .ics import, exams, PWA and offline sync.
6. Vercel config, README with setup steps and env var names only.

Env var names (`.env.example`): `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (both set by the Vercel Neon integration), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (optional on Vercel), `RESEND_API_KEY`, `EMAIL_FROM`, and `MAILPIT_URL` for local development only.
