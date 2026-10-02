import { betterAuth } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { magicLink } from 'better-auth/plugins'
import { getPool } from '@/lib/server/db'
import { sendMagicLinkEmail } from '@/lib/server/mail'

/** Production URL, preview URL on Vercel, or BETTER_AUTH_URL when set explicitly. */
function baseURL(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export const auth = betterAuth({
  appName: 'EDU-Tracker',
  baseURL: baseURL(),
  secret: process.env.BETTER_AUTH_SECRET,
  database: getPool(),
  emailAndPassword: { enabled: false },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    // Serverless instances do not share memory, so limits live in Postgres.
    storage: 'database',
    // Per IP. Loose enough for a classroom behind one campus address, tight
    // enough that the endpoint cannot be used to flood an inbox.
    customRules: {
      '/sign-in/magic-link': { window: 60, max: 20 },
      '/magic-link/verify': { window: 60, max: 60 },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 600,
      sendMagicLink: async ({ email, url }) => sendMagicLinkEmail(email, url),
    }),
    nextCookies(),
  ],
})

export type AuthSession = typeof auth.$Infer.Session
