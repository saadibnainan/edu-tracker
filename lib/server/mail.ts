// Sends the magic-link email. Resend in production; Mailpit's HTTP API in
// local development, so nothing real is sent.

import { Resend } from 'resend'

function content(url: string) {
  const subject = 'Your EDU-Tracker sign-in link'
  const text = `Sign in to EDU-Tracker:\n\n${url}\n\nThe link works once and expires in 10 minutes. If you did not ask for it, ignore this email.`
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:24px;color:#131313">` +
    `<p>Sign in to EDU-Tracker:</p>` +
    `<p><a href="${url}" style="display:inline-block;padding:8px 16px;background:#FF5A1F;color:#0C0C0C;text-decoration:none;font-weight:500">Sign in</a></p>` +
    `<p style="color:#55534F">The link works once and expires in 10 minutes. If you did not ask for it, ignore this email.</p>` +
    `<p style="color:#55534F;word-break:break-all">${url}</p></div>`
  return { subject, text, html }
}

export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  const { subject, text, html } = content(url)
  const from = process.env.EMAIL_FROM ?? 'EDU-Tracker <login@localhost>'

  if (process.env.RESEND_API_KEY) {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from, to, subject, text, html })
    if (error) throw new Error(`Resend: ${error.message}`)
    return
  }

  if (process.env.MAILPIT_URL) {
    const match = from.match(/^(.*)<(.+)>$/)
    const res = await fetch(`${process.env.MAILPIT_URL}/api/v1/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        From: { Email: match ? match[2]!.trim() : from, Name: match ? match[1]!.trim() : 'EDU-Tracker' },
        To: [{ Email: to }],
        Subject: subject,
        Text: text,
        HTML: html,
      }),
    })
    if (!res.ok) throw new Error(`Mailpit: ${res.status}`)
    return
  }

  throw new Error('Email is not configured: set RESEND_API_KEY and EMAIL_FROM.')
}
