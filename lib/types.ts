import type { Database } from './database.types'

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']

export type SessionKind = 'stopwatch' | 'countdown' | 'pomodoro' | 'manual'
export type GoalPeriod = 'daily' | 'weekly'

export type Subject = Row<'subjects'>
export type Session = Omit<Row<'sessions'>, 'kind'> & { kind: SessionKind }
export type Goal = Omit<Row<'goals'>, 'period'> & { period: GoalPeriod }
export type Exam = Row<'exams'>
export type CalendarSource = Row<'calendar_sources'>

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
