import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login']

/**
 * Fast, optimistic gate: redirects requests without a session cookie to
 * /login. Pages and route handlers verify the session itself (lib/server/session.ts).
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const hasSession = Boolean(getSessionCookie(request))

  if (!hasSession && !PUBLIC_PATHS.includes(path)) {
    const to = request.nextUrl.clone()
    to.pathname = '/login'
    to.search = ''
    return NextResponse.redirect(to)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    // Everything except API routes (they answer 401 themselves), static files and icons.
    '/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|icons/|manifest.webmanifest|sw.js|.*\\.(?:png|svg|ico|webmanifest)$).*)',
  ],
}
