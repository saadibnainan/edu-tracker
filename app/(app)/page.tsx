import type { Metadata } from 'next'
import { ExamsCell } from '@/components/dashboard/ExamsCell'
import { TodayCell } from '@/components/dashboard/TodayCell'
import { WeekCell } from '@/components/dashboard/WeekCell'
import { TimerCell } from '@/components/timer/TimerCell'
import { PageHeader } from '@/components/ui/PageHeader'

export const metadata: Metadata = { title: 'Dashboard' }

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="grid grid-cols-12">
        <TimerCell />
        <TodayCell />
        <ExamsCell />
        <WeekCell />
      </div>
    </>
  )
}
