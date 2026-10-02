// Offline-first data store.
//
// Reads come from memory (loaded from IndexedDB). Writes go to memory and
// IndexedDB immediately, plus an outbox entry. The sync engine pushes the
// outbox to /api/sync and pulls the user's rows back. Postgres resolves
// conflicts last-write-wins on updated_at (see the lww_guard trigger).

import { TABLES, type CalendarSource, type Exam, type Goal, type RowOf, type Session, type Subject, type TableName } from '@/lib/types'
import { ackOutbox, clearAll, getAll, getOne, markOutboxError, openDb, putMany, putOne, putWithOutbox, type OutboxEntry } from './idb'

export interface SyncState {
  online: boolean
  syncing: boolean
  queued: number
  failed: number
  lastSyncedAt: number | null
  error: string | null
}

export interface Snapshot {
  ready: boolean
  userId: string | null
  subjects: Subject[]
  sessions: Session[]
  goals: Goal[]
  exams: Exam[]
  calendar_sources: CalendarSource[]
  sync: SyncState
}

const EMPTY: Snapshot = {
  ready: false,
  userId: null,
  subjects: [],
  sessions: [],
  goals: [],
  exams: [],
  calendar_sources: [],
  sync: { online: true, syncing: false, queued: 0, failed: 0, lastSyncedAt: null, error: null },
}

const CHUNK = 200
const INTERVAL_MS = 30_000
const MAX_BACKOFF_MS = 60_000

type AnyRow = RowOf<TableName>

const tables: Record<TableName, Map<string, AnyRow>> = {
  subjects: new Map(),
  sessions: new Map(),
  goals: new Map(),
  exams: new Map(),
  calendar_sources: new Map(),
}

let snapshot: Snapshot = EMPTY
let userId: string | null = null
let sync: SyncState = { ...EMPTY.sync }
const listeners = new Set<() => void>()
let channel: BroadcastChannel | null = null
let timer: ReturnType<typeof setInterval> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let backoff = 2_000
let running = false
let rerun = false
let seqCounter = 0
let detach: (() => void) | null = null

/** Parses Postgres and JS timestamps alike (Postgres may send microseconds). */
export function ts(v: string | null | undefined): number {
  if (!v) return 0
  return Date.parse(v.replace(/(\.\d{3})\d+/, '$1'))
}

const byCreated = (a: { created_at: string }, b: { created_at: string }) => ts(a.created_at) - ts(b.created_at)

function emit() {
  snapshot = {
    ready: userId !== null,
    userId,
    subjects: ([...tables.subjects.values()] as Subject[]).sort((a, b) => byCreated(a, b) || a.name.localeCompare(b.name)),
    sessions: ([...tables.sessions.values()] as Session[]).sort((a, b) => ts(b.started_at) - ts(a.started_at)),
    goals: ([...tables.goals.values()] as Goal[]).sort(byCreated),
    exams: ([...tables.exams.values()] as Exam[]).sort((a, b) => (a.exam_date < b.exam_date ? -1 : a.exam_date > b.exam_date ? 1 : 0)),
    calendar_sources: ([...tables.calendar_sources.values()] as CalendarSource[]).sort(byCreated),
    sync: { ...sync },
  }
  for (const l of listeners) l()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getSnapshot = () => snapshot
export const getServerSnapshot = () => EMPTY

async function loadFromDisk() {
  for (const t of TABLES) {
    const rows = await getAll<AnyRow>(t)
    tables[t] = new Map(rows.map((r) => [r.id, r]))
  }
  await refreshCounts()
}

async function refreshCounts() {
  const entries = await getAll<OutboxEntry>('outbox')
  sync.queued = entries.filter((e) => !e.error).length
  sync.failed = entries.filter((e) => e.error).length
}

/** Loads the signed-in user's local data and starts syncing. Safe to call repeatedly. */
export async function initStore(id: string): Promise<void> {
  if (userId === id) return
  await openDb()
  const owner = await getOne<string>('meta', 'userId')
  if (owner && owner !== id) await clearAll()
  await putOne('meta', id, 'userId')
  // Rows the server rejected get one more try per app start.
  const outbox = await getAll<OutboxEntry>('outbox')
  const failed = outbox.filter((e) => e.error)
  for (const e of failed) {
    delete e.error
    await putOne('outbox', e)
  }
  await loadFromDisk()
  sync.lastSyncedAt = (await getOne<number>('meta', 'lastSyncedAt')) ?? null
  sync.online = navigator.onLine
  userId = id
  emit()
  attach()
  void runSync()
}

function attach() {
  detach?.()
  const onOnline = () => {
    sync.online = true
    emit()
    void runSync()
  }
  const onOffline = () => {
    sync.online = false
    emit()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') void runSync()
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel('edu-sync')
    channel.onmessage = async () => {
      await loadFromDisk()
      emit()
    }
  }
  timer = setInterval(() => void runSync(), INTERVAL_MS)
  detach = () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisible)
    channel?.close()
    channel = null
    if (timer) clearInterval(timer)
    if (retryTimer) clearTimeout(retryTimer)
    timer = null
    retryTimer = null
  }
}

function broadcast() {
  channel?.postMessage('changed')
}

function nowIso(previous?: string): string {
  // updated_at must strictly increase per row, even for two writes in one millisecond.
  const now = Date.now()
  const prev = ts(previous)
  return new Date(Math.max(now, prev + 1)).toISOString()
}

export function hasRow(table: TableName, id: string): boolean {
  return tables[table].has(id)
}

export function newId(): string {
  return crypto.randomUUID()
}

/** Inserts or updates a row locally and queues it for sync. */
export async function save<T extends TableName>(table: T, row: Omit<RowOf<T>, 'user_id' | 'created_at' | 'updated_at'> & Partial<Pick<RowOf<T>, 'created_at'>>): Promise<RowOf<T>> {
  if (!userId) throw new Error('Store is not ready')
  const existing = tables[table].get(row.id) as RowOf<T> | undefined
  const stamp = nowIso(existing?.updated_at)
  const full = {
    ...existing,
    ...row,
    user_id: userId,
    created_at: existing?.created_at ?? row.created_at ?? stamp,
    updated_at: stamp,
  } as RowOf<T>
  // Commit to IndexedDB before showing it: the UI never shows a write that a
  // reload or tab close right afterwards could lose.
  seqCounter = (seqCounter + 1) % 1000
  await putWithOutbox(table, full as unknown as Record<string, unknown> & { id: string }, Date.now() * 1000 + seqCounter)
  tables[table].set(full.id, full)
  await refreshCounts()
  emit()
  broadcast()
  void runSync()
  return full
}

/** Partial update of an existing row. */
export async function update<T extends TableName>(table: T, id: string, patch: Partial<RowOf<T>>): Promise<RowOf<T> | null> {
  const existing = tables[table].get(id) as RowOf<T> | undefined
  if (!existing) return null
  return save(table, { ...existing, ...patch, id } as never)
}

class TransientError extends Error {}

interface RowResult {
  id: string | null
  ok: boolean
  error?: string
}

async function api<T>(init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch('/api/sync', { cache: 'no-store', ...init })
  } catch {
    throw new TransientError('Network error')
  }
  // 401 (expired session), 429 and 5xx are worth retrying later; other errors are bugs.
  if (!res.ok) throw new TransientError(`Sync failed (${res.status})`)
  return (await res.json()) as T
}

async function flush() {
  const entries = (await getAll<OutboxEntry>('outbox')).filter((e) => !e.error)
  for (const table of TABLES) {
    const batch = entries.filter((e) => e.table === table).sort((a, b) => a.seq - b.seq)
    for (let i = 0; i < batch.length; i += CHUNK) {
      const chunk = batch.slice(i, i + CHUNK)
      const { results } = await api<{ results: RowResult[] }>({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ table, rows: chunk.map((e) => e.row) }),
      })
      const byId = new Map(results.map((r) => [r.id, r]))
      const acked: OutboxEntry[] = []
      for (const e of chunk) {
        const r = byId.get(e.id)
        if (r?.ok) acked.push(e)
        else await markOutboxError(e, r?.error ?? 'Rejected by the server')
      }
      await ackOutbox(acked)
    }
  }
}

async function pull() {
  const pending = new Set((await getAll<OutboxEntry>('outbox')).map((e) => e.key))
  const data = await api<Record<TableName, AnyRow[]>>()
  let changedAny = false
  for (const table of TABLES) {
    const changed: AnyRow[] = []
    for (const r of data[table] ?? []) {
      if (pending.has(`${table}:${r.id}`)) continue
      const local = tables[table].get(r.id)
      if (!local || ts(r.updated_at) > ts(local.updated_at) || (ts(r.updated_at) === ts(local.updated_at) && JSON.stringify(r) !== JSON.stringify(local))) {
        tables[table].set(r.id, r)
        changed.push(r)
      }
    }
    if (changed.length) {
      changedAny = true
      await putMany(table, changed)
    }
  }
  return changedAny
}

async function syncOnce() {
  if (!navigator.onLine) {
    sync.online = false
    emit()
    return
  }
  sync.syncing = true
  emit()
  try {
    await flush()
    const changed = await pull()
    sync.lastSyncedAt = Date.now()
    sync.error = null
    sync.online = true
    backoff = 2_000
    await putOne('meta', sync.lastSyncedAt, 'lastSyncedAt')
    if (changed) broadcast()
  } catch (err) {
    sync.error = err instanceof Error ? err.message : 'Sync failed'
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = setTimeout(() => void runSync(), backoff)
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
  } finally {
    sync.syncing = false
    await refreshCounts()
    emit()
  }
}

/** Runs one sync, at most one at a time across all tabs. */
export async function runSync(): Promise<void> {
  if (!userId) return
  if (running) {
    rerun = true
    return
  }
  running = true
  try {
    do {
      rerun = false
      if (navigator.locks) await navigator.locks.request('edu-sync', () => syncOnce())
      else await syncOnce()
    } while (rerun)
  } finally {
    running = false
  }
}

/** Sign-out: forget everything local. */
export async function resetStore(): Promise<void> {
  detach?.()
  detach = null
  userId = null
  for (const t of TABLES) tables[t].clear()
  sync = { ...EMPTY.sync }
  await clearAll()
  emit()
}

// --- Calendar cache -------------------------------------------------------

export async function readIcsCache<T>(key: string): Promise<T | undefined> {
  return getOne<T>('ics_cache', key)
}

export async function writeIcsCache(key: string, value: unknown): Promise<void> {
  await putOne('ics_cache', value, key)
}
