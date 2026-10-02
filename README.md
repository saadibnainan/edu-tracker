# EDU-Tracker

Study tracker: stopwatch, countdown and pomodoro timer, subjects, session notes, goals, stats with streaks, a weekly timetable from an `.ics` link, and exam countdowns. Works offline and syncs across devices.

Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Neon Postgres (through the Vercel Marketplace) + Better Auth (email magic links) + Resend. Deploys to Vercel.

- `PLAN.md`: architecture, schema, offline sync design, risks.
- `STYLE.md`: design tokens, contrast ratios, component rules.

## Requirements

- Node.js 20.12 or newer
- Docker, for the local Postgres and Mailpit (`compose.yaml`)

## Environment variables

Names only. Locally they go in `.env.local`; on Vercel in the project settings (the Neon integration adds the database ones itself).

| Name | Used for |
|---|---|
| `DATABASE_URL` | Postgres connection used by the app (Neon: pooled URL) |
| `DATABASE_URL_UNPOOLED` | Direct connection for `npm run db:migrate` (Neon sets it; optional locally) |
| `BETTER_AUTH_SECRET` | Signs sessions. A random string, at least 32 characters |
| `BETTER_AUTH_URL` | Public base URL. Optional on Vercel, where it is derived from the deployment URL |
| `RESEND_API_KEY` | Sends magic-link emails |
| `EMAIL_FROM` | Sender, for example `EDU-Tracker <login@your-domain>`, on a domain verified in Resend |
| `MAILPIT_URL` | Local development only. Magic-link emails go to Mailpit instead of Resend |

`.env.example` lists the same names.

## Local development

```bash
npm ci
npx playwright install chromium   # once, for e2e tests and the icon script
npm run db:up                     # Postgres 17 on 127.0.0.1:5432, Mailpit on 127.0.0.1:8025
cp .env.example .env.local
```

Fill `.env.local`:

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/edu
BETTER_AUTH_SECRET=<output of: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
MAILPIT_URL=http://127.0.0.1:8025
EMAIL_FROM="EDU-Tracker <login@edu-tracker.local>"
```

Then:

```bash
npm run db:migrate   # applies db/migrations/*.sql
npm run dev
```

Open http://localhost:3000, enter any email, and open the sign-in link from Mailpit at http://127.0.0.1:8025.

The service worker only registers in production builds. To try offline mode locally: `npm run build && npm run start`.

`npm run db:down` stops the containers; the database volume is kept.

## Checks

```bash
npm run lint        # ESLint (eslint-config-next)
npm run typecheck   # tsc --noEmit (TypeScript 7)
npm test            # Vitest: timer math, streaks and stats, .ics parsing, SSRF guard, formatting
npm run build       # production build, also type-checks
npm run test:e2e    # Playwright against `next start`, local Postgres and Mailpit
```

The e2e suite signs in through real magic links from Mailpit and refuses to run against a non-local database. It writes screenshots of every screen at 375 and 1440 px to `design/screenshots/app/`.

## Deploying

### 1. Database: Neon through Vercel

1. In the Vercel project, open Storage (or the Marketplace), add **Neon**, and connect it to the project. This sets `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and related variables for each environment.
2. Apply the schema from your machine, with the production connection string in your shell:
   ```bash
   DATABASE_URL_UNPOOLED='<from the Vercel or Neon dashboard>' npm run db:migrate
   ```
   This creates Better Auth's tables, the five app tables, the `app_user` role, the RLS policies and the last-write-wins trigger. It is safe to run again; applied files are skipped.

### 2. Email: Resend

1. Create a Resend account (also available in the Vercel Marketplace) and verify a sending domain.
2. Set `RESEND_API_KEY` and `EMAIL_FROM` in Vercel.

### 3. Vercel

1. Import the repository. `vercel.json` sets the framework, install and build commands.
2. Set `BETTER_AUTH_SECRET` for Production and Preview. Set `BETTER_AUTH_URL` only if you serve the app from a custom domain that is not the project's production domain.
3. Deploy.

After the first deploy, open the site once while online. The service worker then caches the app so it opens and records sessions offline.

## Icons

All icons come from `design/favicon.svg`. After changing it:

```bash
npm run icons
```

This regenerates `app/icon.svg`, `app/favicon.ico` (16, 32, 48), `app/apple-icon.png` (180), and `public/icons/` (192, 512, maskable 512). Commit the results.

## How data flows

Reads and writes go to IndexedDB first, so the app works offline. Each write also lands in an outbox, which is pushed to `/api/sync` when online, followed by a pull of all the user's rows. The route handler runs every query as the restricted `app_user` role with the signed-in user's id set, so Postgres row level security decides what each request can see or change. Postgres keeps whichever version of a row has the newer `updated_at`. The running timer and pomodoro settings live in `localStorage` on each device. Details are in `PLAN.md`, sections 5 and 8.

## Project layout

```
app/                 routes, layouts, icons, manifest, /api/auth, /api/sync, /api/ics
components/          UI by feature (timer, history, subjects, goals, stats, calendar, shell)
lib/                 timer state machine, stats, .ics parsing and SSRF guard, IndexedDB store, auth
lib/server/          pg pool and asUser(), session helper, mailer, row validation
proxy.ts             redirect to /login without a session cookie
public/sw.js         service worker
db/migrations/       Better Auth tables, app schema, role, RLS, triggers
scripts/             migration runner, icon generator
compose.yaml         local Postgres and Mailpit
tests/unit           Vitest
tests/e2e            Playwright
design/              favicon source, concepts, mockup, contrast script, screenshots
```
