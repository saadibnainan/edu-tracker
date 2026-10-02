'use client'

import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip, type ChartConfiguration } from 'chart.js'
import { useEffect, useRef } from 'react'
import { formatDuration } from '@/lib/format'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

const TEXT = '#E9E7E2'
const MUTED = '#8A8883'
const LINE = '#2B2B2B'
const LINE_STRONG = '#3D3D3D'
const ACCENT = '#FF5A1F'
const RAISED = '#1A1A1A'

export interface ChartDay {
  label: string
  title: string
  seconds: number
  current: boolean
}

function niceStep(maxHours: number): number {
  if (maxHours <= 2) return 0.5
  if (maxHours <= 5) return 1
  if (maxHours <= 10) return 2
  return 4
}

/** Flat bars in text color, current day in accent, 1px gridlines, mono labels. */
export function DailyChart({ days, ariaLabel }: { days: ChartDay[]; ariaLabel: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const chart = useRef<Chart<'bar'> | null>(null)

  useEffect(() => {
    if (!canvas.current) return
    const mono = getComputedStyle(document.body).getPropertyValue('--font-plex-mono').trim() || 'ui-monospace, monospace'
    const font = { family: mono, size: 11, lineHeight: 1.45 }
    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: { labels: [], datasets: [{ data: [], backgroundColor: [], hoverBackgroundColor: [], borderWidth: 0, borderRadius: 0, barPercentage: 0.72, categoryPercentage: 1 }] },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        events: ['mousemove', 'mouseout', 'touchstart', 'touchmove'],
        layout: { padding: { top: 8 } },
        scales: {
          x: {
            grid: { display: false },
            border: { color: LINE_STRONG },
            ticks: { color: MUTED, font, maxRotation: 0, autoSkip: true, autoSkipPadding: 8 },
          },
          y: {
            beginAtZero: true,
            grid: { color: LINE, lineWidth: 1, drawTicks: false },
            border: { display: false },
            ticks: { color: MUTED, font, padding: 8, callback: (v) => `${Number(v)}h` },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: RAISED,
            borderColor: LINE_STRONG,
            borderWidth: 1,
            cornerRadius: 0,
            caretSize: 0,
            displayColors: false,
            padding: 8,
            titleColor: MUTED,
            bodyColor: TEXT,
            titleFont: font,
            bodyFont: { ...font, size: 13 },
          },
        },
      },
    }
    chart.current = new Chart(canvas.current, config)
    return () => {
      chart.current?.destroy()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    const c = chart.current
    if (!c) return
    const hours = days.map((d) => d.seconds / 3600)
    const max = Math.max(1, ...hours)
    const ds = c.data.datasets[0]!
    c.data.labels = days.map((d) => d.label)
    ds.data = hours
    ds.backgroundColor = days.map((d) => (d.current ? ACCENT : TEXT))
    ds.hoverBackgroundColor = days.map((d) => (d.current ? ACCENT : TEXT))
    const y = c.options.scales!.y!
    ;(y as { ticks: { stepSize?: number } }).ticks.stepSize = niceStep(max)
    c.options.plugins!.tooltip!.callbacks = {
      title: (items) => days[items[0]?.dataIndex ?? 0]?.title ?? '',
      label: (item) => formatDuration(days[item.dataIndex]?.seconds ?? 0),
    }
    c.update('none')
  }, [days])

  return (
    <div className="relative h-[240px]">
      <canvas ref={canvas} role="img" aria-label={ariaLabel} />
    </div>
  )
}
