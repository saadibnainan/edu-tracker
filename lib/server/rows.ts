// Validation and SQL for rows coming from the client outbox. The server sets
// user_id from the session; whatever the client sends there is ignored.

import type { TableName } from '@/lib/types'

type Kind = 'uuid' | 'uuid?' | 'text' | 'text?' | 'int' | 'int?' | 'ts' | 'ts?' | 'date' | 'text[]'

/** Writable columns per table (besides id, user_id, created_at, updated_at). */
export const COLUMNS: Record<TableName, Record<string, Kind>> = {
  subjects: { name: 'text', color_index: 'int', weekly_target_minutes: 'int?', archived_at: 'ts?' },
  sessions: {
    subject_id: 'uuid',
    started_at: 'ts',
    ended_at: 'ts',
    duration_seconds: 'int',
    kind: 'text',
    note: 'text?',
    tags: 'text[]',
    deleted_at: 'ts?',
  },
  goals: { subject_id: 'uuid?', period: 'text', target_minutes: 'int', deleted_at: 'ts?' },
  exams: { subject_id: 'uuid', exam_date: 'date', title: 'text?', deleted_at: 'ts?' },
  calendar_sources: { url: 'text', label: 'text?', deleted_at: 'ts?' },
}

export const TABLE_NAMES = Object.keys(COLUMNS) as TableName[]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

function check(kind: Kind, v: unknown): boolean {
  const optional = kind.endsWith('?')
  if (optional && v === null) return true
  switch (kind.replace('?', '')) {
    case 'uuid':
      return typeof v === 'string' && UUID.test(v)
    case 'text':
      return typeof v === 'string' && v.length <= 4096
    case 'int':
      return typeof v === 'number' && Number.isInteger(v)
    case 'ts':
      return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v))
    case 'date':
      return typeof v === 'string' && DATE.test(v)
    case 'text[]':
      return Array.isArray(v) && v.length <= 20 && v.every((x) => typeof x === 'string' && x.length <= 64)
  }
  return false
}

export interface ValidRow {
  id: string
  values: unknown[]
}

/** Returns the parameter list for `upsertSql`, or an error message. */
export function validateRow(table: TableName, row: unknown): ValidRow | string {
  if (!row || typeof row !== 'object') return 'Row must be an object.'
  const r = row as Record<string, unknown>
  if (!check('uuid', r.id)) return 'Invalid id.'
  if (!check('ts', r.created_at) || !check('ts', r.updated_at)) return 'Invalid timestamps.'
  const values: unknown[] = [r.id, r.created_at, r.updated_at]
  for (const [col, kind] of Object.entries(COLUMNS[table])) {
    const v = r[col] === undefined && kind.endsWith('?') ? null : r[col]
    if (!check(kind, v)) return `Invalid ${col}.`
    values.push(v)
  }
  return { id: r.id as string, values }
}

/** INSERT .. ON CONFLICT (id) DO UPDATE. $1 id, $2 created_at, $3 updated_at, then columns, last param user_id. */
export function upsertSql(table: TableName): string {
  const cols = Object.keys(COLUMNS[table])
  const all = ['id', 'created_at', 'updated_at', ...cols]
  const params = all.map((_, i) => `$${i + 1}`)
  const updates = ['updated_at', ...cols].map((c) => `${c} = excluded.${c}`).join(', ')
  return `insert into public.${table} (${all.join(', ')}, user_id) values (${params.join(', ')}, $${all.length + 1}) on conflict (id) do update set ${updates}`
}
