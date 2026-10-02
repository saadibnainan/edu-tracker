import type { Metadata } from 'next'
import { CalendarView } from '@/components/calendar/CalendarView'

export const metadata: Metadata = { title: 'Calendar' }

export default function CalendarPage() {
  return <CalendarView />
}
