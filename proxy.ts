import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseEnv } from '@/lib/supabase/env'

const PUBLIC_PATHS = ['/login', '/auth/']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { url, key } = supabaseEnv()

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options)
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v)
      },
    },
  })

  // Refreshes an expired session and verifies the JWT.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)
  const path = request.nextUrl.pathname

  if (path.startsWith('/api/')) return response

  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p))
  if (!signedIn && !isPublic) {
    const to = request.nextUrl.clone()
    to.pathname = '/login'
    to.search = ''
    return copyCookies(response, NextResponse.redirect(to))
  }
  if (signedIn && path === '/login') {
    const to = request.nextUrl.clone()
    to.pathname = '/'
    to.search = ''
    return copyCookies(response, NextResponse.redirect(to))
  }
  return response
}

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const c of from.cookies.getAll()) to.cookies.set(c)
  const cc = from.headers.get('cache-control')
  if (cc) to.headers.set('cache-control', cc)
  return to
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|icons/|manifest.webmanifest|sw.js|.*\\.(?:png|svg|ico|webmanifest)$).*)',
  ],
}
