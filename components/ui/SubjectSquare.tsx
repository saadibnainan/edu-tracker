import { subjectColor } from '@/lib/types'

export function SubjectSquare({ color, dim = false }: { color: number; dim?: boolean }) {
  return <i className="sq" style={{ background: subjectColor(color), opacity: dim ? 0.4 : 1 }} aria-hidden="true" />
}
