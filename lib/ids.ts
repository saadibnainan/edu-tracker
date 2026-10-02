/**
 * Deterministic UUID (version 8 layout) from a name, via SHA-256. Two devices
 * creating "the global daily goal" offline get the same id, so their writes
 * merge last-write-wins instead of colliding on the unique index.
 */
export async function stableUuid(name: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(name)))
  const b = digest.slice(0, 16)
  b[6] = (b[6]! & 0x0f) | 0x80
  b[8] = (b[8]! & 0x3f) | 0x80
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function goalKey(userId: string, subjectId: string | null, period: string): string {
  return `goal:${userId}:${subjectId ?? 'all'}:${period}`
}
