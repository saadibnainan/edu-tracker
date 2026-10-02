// Minimal promise wrapper over IndexedDB. No dependencies.

import { TABLES, type TableName } from '@/lib/types'

export const DB_NAME = 'edu-tracker'
const DB_VERSION = 1

export type StoreName = TableName | 'outbox' | 'meta' | 'ics_cache'

export interface OutboxEntry {
  /** `${table}:${id}`, so repeated writes to one row coalesce. */
  key: string
  table: TableName
  id: string
  row: Record<string, unknown>
  /** Monotonic order of the latest write. */
  seq: number
  /** Set when the server rejected the write (RLS, constraint). */
  error?: string
}

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const t of TABLES) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' })
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      if (!db.objectStoreNames.contains('ics_cache')) db.createObjectStore('ics_cache')
    }
    req.onsuccess = () => {
      const db = req.result
      // Another tab upgraded the schema: close so it can proceed.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'))
  })
  return dbPromise
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
  })
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb()
  return result(db.transaction(store, 'readonly').objectStore(store).getAll() as IDBRequest<T[]>)
}

export async function getOne<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb()
  return result(db.transaction(store, 'readonly').objectStore(store).get(key) as IDBRequest<T | undefined>)
}

export async function putOne(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).put(value, key)
  await done(tx)
}

/** Writes a row and its outbox entry atomically. */
export async function putWithOutbox(table: TableName, row: Record<string, unknown> & { id: string }, seq: number): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([table, 'outbox'], 'readwrite')
  tx.objectStore(table).put(row)
  const entry: OutboxEntry = { key: `${table}:${row.id}`, table, id: row.id, row, seq }
  tx.objectStore('outbox').put(entry)
  await done(tx)
}

export async function putMany(store: TableName, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  for (const r of rows) os.put(r)
  await done(tx)
}

/** Removes outbox entries only if they still hold the version that was sent. */
export async function ackOutbox(sent: OutboxEntry[]): Promise<void> {
  if (sent.length === 0) return
  const db = await openDb()
  const tx = db.transaction('outbox', 'readwrite')
  const os = tx.objectStore('outbox')
  for (const e of sent) {
    const req = os.get(e.key)
    req.onsuccess = () => {
      const current = req.result as OutboxEntry | undefined
      if (current && current.seq === e.seq) os.delete(e.key)
    }
  }
  await done(tx)
}

export async function markOutboxError(entry: OutboxEntry, error: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('outbox', 'readwrite')
  const os = tx.objectStore('outbox')
  const req = os.get(entry.key)
  req.onsuccess = () => {
    const current = req.result as OutboxEntry | undefined
    if (current && current.seq === entry.seq) os.put({ ...current, error })
  }
  await done(tx)
}

export async function clearAll(): Promise<void> {
  const db = await openDb()
  const names: StoreName[] = [...TABLES, 'outbox', 'meta', 'ics_cache']
  const tx = db.transaction(names, 'readwrite')
  for (const n of names) tx.objectStore(n).clear()
  await done(tx)
}
