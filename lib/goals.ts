import type { Goal } from '@/lib/types'

/** Live (not removed) goal for a scope; subjectId null means the global goal. */
export function findGoal(goals: readonly Goal[], period: Goal['period'], subjectId: string | null): Goal | undefined {
  return goals.find((g) => !g.deleted_at && g.period === period && g.subject_id === subjectId)
}
