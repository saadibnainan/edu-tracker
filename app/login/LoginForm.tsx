'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; email: string } | { kind: 'error'; message: string }

export function LoginForm({ linkError }: { linkError: boolean }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>(
    linkError ? { kind: 'error', message: 'That link expired or was already used. Send a new one.' } : { kind: 'idle' },
  )

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    if (!navigator.onLine) {
      setStatus({ kind: 'error', message: 'You are offline. Connect to send a sign-in link.' })
      return
    }
    setStatus({ kind: 'sending' })
    const { error } = await authClient.signIn.magicLink({ email: value, callbackURL: '/', errorCallbackURL: '/login' })
    if (error) setStatus({ kind: 'error', message: error.status === 429 ? 'Too many requests. Wait a minute and try again.' : 'The link could not be sent. Check the address and try again.' })
    else setStatus({ kind: 'sent', email: value })
  }

  if (status.kind === 'sent') {
    return (
      <div className="flex flex-col gap-4">
        <p>Link sent to {status.email}. Open it on this device to sign in.</p>
        <button type="button" className="btn self-start" onClick={() => setStatus({ kind: 'idle' })}>
          Use another email
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <label className="field">
        <span className="label">Email</span>
        <input
          className="input"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@university.edu"
        />
      </label>
      <div className="flex items-center gap-4 flex-wrap">
        <button className="btn btn-primary" type="submit" disabled={status.kind === 'sending' || !email.trim()}>
          {status.kind === 'sending' ? 'Sending' : 'Send link'}
        </button>
        <span className="label">No password. We email you a sign-in link.</span>
      </div>
      {status.kind === 'error' && (
        <p className="msg msg-error" role="alert">
          {status.message}
        </p>
      )}
    </form>
  )
}
