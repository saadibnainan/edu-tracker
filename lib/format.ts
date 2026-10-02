const pad = (n: number) => String(n).padStart(2, '0')

/** HH:MM:SS for timers. Negative input clamps to zero. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

/** MM:SS under an hour, HH:MM:SS otherwise. Used in the document title. */
export function formatShortClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  if (total < 3600) return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
  return formatClock(ms)
}

/** H:MM for durations, e.g. 2:41. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60))
  return `${Math.floor(total / 60)}:${pad(total % 60)}`
}

export function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Thu 02 Oct 2026" */
export function formatLongDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "Thu 02 Oct" */
export function formatShortDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${pad(d.getDate())} ${MONTHS[d.getMonth()]}`
}

export function weekdayShort(d: Date): string {
  return WEEKDAYS[d.getDay()] ?? ''
}

/** Parses "1:30", "1.5", "90m" style input into minutes. Returns null when invalid. */
export function parseHoursInput(input: string): number | null {
  const v = input.trim().toLowerCase()
  if (!v) return null
  let m: RegExpMatchArray | null
  if ((m = v.match(/^(\d{1,3}):([0-5]\d)$/))) return Number(m[1]) * 60 + Number(m[2])
  if ((m = v.match(/^(\d{1,4})\s*m(in)?$/))) return Number(m[1])
  if ((m = v.match(/^(\d{1,3}(?:[.,]\d{1,2})?)\s*h?$/))) return Math.round(Number(m[1]!.replace(',', '.')) * 60)
  return null
}

/** Normalizes a comma separated tag string: trimmed, lowercased, unique, max 20. */
export function parseTags(input: string): string[] {
  const out: string[] = []
  for (const raw of input.split(',')) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 32)
    if (t && !out.includes(t)) out.push(t)
  }
  return out.slice(0, 20)
}
