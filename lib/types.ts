// Row shapes as the client stores them and /api/sync returns them.
// Timestamps are ISO 8601 strings; exam_date is "YYYY-MM-DD".

export type SessionKind = 'stopwatch' | 'countdown' | 'pomodoro' | 'manual'
export type GoalPeriod = 'daily' | 'weekly'

interface Base {
  id: string
  user_id: string
  created_at: string
  updated_at: string
}

export interface Subject extends Base {
  name: string
  color_index: number
  weekly_target_minutes: number | null
  archived_at: string | null
}

export interface Session extends Base {
  subject_id: string
  started_at: string
  ended_at: string
  duration_seconds: number
  kind: SessionKind
  note: string | null
  tags: string[]
  deleted_at: string | null
}

export interface Goal extends Base {
  subject_id: string | null
  period: GoalPeriod
  target_minutes: number
  deleted_at: string | null
}

export interface Exam extends Base {
  subject_id: string
  exam_date: string
  title: string | null
  deleted_at: string | null
}

export interface CalendarSource extends Base {
  url: string
  label: string | null
  deleted_at: string | null
}

export type TableName = 'subjects' | 'sessions' | 'goals' | 'exams' | 'calendar_sources'

export type RowOf<T extends TableName> = {
  subjects: Subject
  sessions: Session
  goals: Goal
  exams: Exam
  calendar_sources: CalendarSource
}[T]

/** Sync order matters: rows that others reference by foreign key go first. */
export const TABLES: readonly TableName[] = ['subjects', 'sessions', 'goals', 'exams', 'calendar_sources']

export const SUBJECT_COLORS = ['#7D8CA3', '#869777', '#A3866F', '#9A8298', '#6E9895', '#A39766'] as const
export const SUBJECT_COLOR_NAMES = ['Slate', 'Sage', 'Clay', 'Mauve', 'Teal', 'Ochre'] as const

export function subjectColor(index: number): string {
  return SUBJECT_COLORS[index] ?? SUBJECT_COLORS[0]
}
