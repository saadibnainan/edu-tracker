/** Turns a time from /api/ics into a local Date. Wall-clock forms are read in the viewer's zone. */
export function icsTimeToDate(v: string): Date {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?$/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0))
  return new Date(v)
}

export interface IcsEventDto {
  uid: string
  summary: string
  location: string | null
  start: string
  end: string
  allDay: boolean
}

/** webcal:// is the same feed over https. Returns null for anything else that is not https. */
export function normalizeIcsUrl(input: string): string | null {
  const v = input.trim().replace(/^webcals?:\/\//i, 'https://')
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' || !u.hostname) return null
    if (u.username || u.password) return null
    return u.toString()
  } catch {
    return null
  }
}
