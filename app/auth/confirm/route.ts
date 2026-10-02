import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

/** Magic-link landing. Handles the PKCE `code` form and the `token_hash` form. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const code = params.get('code')
  const tokenHash = params.get('token_hash')
  const type = params.get('type') as EmailOtpType | null
  const supabase = await supabaseServer()

  let ok = false
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error
  }

  const to = request.nextUrl.clone()
  to.search = ''
  to.pathname = ok ? '/' : '/login'
  if (!ok) to.searchParams.set('error', 'link')
  return NextResponse.redirect(to)
}
