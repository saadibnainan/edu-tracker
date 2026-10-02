import type { Metadata } from 'next'
import { GoalsView } from '@/components/goals/GoalsView'

export const metadata: Metadata = { title: 'Goals' }

export default function GoalsPage() {
  return <GoalsView />
}
