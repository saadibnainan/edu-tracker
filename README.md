# EDU-Tracker

Study tracker: stopwatch, countdown and pomodoro timer, subjects, session notes, goals, stats with streaks, a weekly timetable from an `.ics` link, and exam countdowns. Works offline and syncs across devices.

Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Supabase (Postgres, Auth, Row Level Security). Deploys to Vercel.

- `PLAN.md`: architecture, schema, offline sync design, risks.
- `STYLE.md`: design tokens, contrast ratios, component rules.

## Requirements

- Node.js 20.9 or newer
- Docker, only for the local Supabase stack

## Environment variables

Set these in `.env.local` for local development and in Vercel project settings for deployments. Values come from the Supabase dashboard, Project Settings, API Keys. Names only:

| Name | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (client) key |

`.env.example` lists the same names. No server secret is needed: every query runs as the signed-in user under RLS.

## Local development

```bash
npm ci
npx playwright install chromium   # once, for e2e tests and the icon script
npm run db:start                  # local Supabase in Docker, applies supabase/migrations
```

`npm run db:start` prints the local API URL and publishable key. Put them in `.env.local`:

```bash
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

Open http://localhost:3000 and sign in with any email. Local emails are not sent; open the magic link from Mailpit at http://127.0.0.1:54324.

The service worker only registers in production builds. To try offline mode locally: `npm run build && npm run start`.

## Checks

```bash
npm run lint        # ESLint (eslint-config-next)
npm run typecheck   # tsc --noEmit (TypeScript 7)
npm test            # Vitest: timer math, streaks and stats, .ics parsing, SSRF guard, formatting
npm run build       # production build, also type-checks
npm run test:e2e    # Playwright against `next start` and the local Supabase stack
```

The e2e suite signs in through real magic links from Mailpit and refuses to run against anything but the local stack. It writes screenshots of every screen at 375 and 1440 px to `design/screenshots/app/`.

## Deploying

### 1. Supabase project

1. Create a project at supabase.com.
2. Apply the schema. From this repo, with the Supabase CLI:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   This runs `supabase/migrations/*.sql`: five tables, RLS on every table, and the last-write-wins trigger.
3. Authentication, URL Configuration:
   - Site URL: your production URL, for example `https://edu-tracker.example.com`
   - Redirect URLs: add `https://<your-domain>/auth/confirm`, plus `https://*-<your-team>.vercel.app/auth/confirm` if you want preview deployments to sign in.
4. Authentication, Sign In / Providers: Email enabled. Magic links work with the default email template.
5. For real users, configure custom SMTP (Authentication, Emails). The built-in sender is rate limited and meant for testing.

### 2. Vercel

1. Import the repository in Vercel. `vercel.json` sets the framework, install and build commands.
2. Add both environment variables from the table above to Production (and Preview if used).
3. Deploy.

After the first deploy, open the site once while online. The service worker then caches the app so it opens and records sessions offline.

## Icons

All icons come from `design/favicon.svg`. After changing it:

```bash
npm run icons
```

This regenerates `app/icon.svg`, `app/favicon.ico` (16, 32, 48), `app/apple-icon.png` (180), and `public/icons/` (192, 512, maskable 512). Commit the results.

## How data flows

Reads and writes go to IndexedDB first, so the app works offline. Each write also lands in an outbox, which is pushed to Supabase when online and then followed by a full pull of the user's rows. Postgres keeps whichever version has the newer `updated_at`. The running timer and pomodoro settings live in `localStorage` on each device. Details are in `PLAN.md`, section 8.

## Project layout

```
app/                 routes, layouts, icons, manifest, /api/ics, /auth/confirm
components/          UI by feature (timer, history, subjects, goals, stats, calendar, shell)
lib/                 timer state machine, stats, .ics parsing and SSRF guard, IndexedDB store, Supabase clients
proxy.ts             session refresh and sign-in redirect
public/sw.js         service worker
supabase/migrations  schema, RLS, triggers
scripts/             icon generator
tests/unit           Vitest
tests/e2e            Playwright
design/              favicon source, concepts, mockup, contrast script, screenshots
```
