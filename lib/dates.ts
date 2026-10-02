// Local-time calendar helpers. Day and week boundaries follow the browser's zone.
// Weeks start on Monday (ISO 8601). Arithmetic uses calendar fields, never
// fixed 24 h offsets, so DST transitions stay correct.

const pad = (n: number) => String(n).padStart(2, '0')

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds())
}

export function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7 // Monday = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day)
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function startOfNextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1)
}

/** Parses "YYYY-MM-DD" as a local date. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

/** Whole calendar days from a to b (local dates). */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((ub - ua) / 86_400_000)
}

/** Value for <input type="datetime-local">. */
export function toDateTimeLocal(d: Date): string {
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDateTimeLocal(v: string): Date | null {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
}
