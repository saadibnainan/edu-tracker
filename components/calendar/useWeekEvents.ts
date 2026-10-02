'use client'

import { useEffect, useState } from 'react'
import { dayKey } from '@/lib/dates'
import { readIcsCache, writeIcsCache } from '@/lib/db/store'
import { icsTimeToDate, type IcsEventDto } from '@/lib/ics/time'
import type { CalendarSource } from '@/lib/types'

export interface WeekEvent extends IcsEventDto {
  sourceId: string
  startDate: Date
  endDate: Date
}

interface CacheEntry {
  url: string
  fetchedAt: number
  events: IcsEventDto[]
}

export interface WeekEventsState {
  events: WeekEvent[]
  loading: boolean
  /** Per source error text. */
  errors: Record<string, string>
  /** True when some data came from the offline cache. */
  cached: boolean
}

function toWeekEvents(sourceId: string, list: IcsEventDto[], from: Date, to: Date): WeekEvent[] {
  return list
    .map((e) => ({ ...e, sourceId, startDate: icsTimeToDate(e.start), endDate: icsTimeToDate(e.end) }))
    .filter((e) => e.startDate < to && e.endDate > from)
}

/** Loads this week's events for every calendar source: cache first, then network. */
export function useWeekEvents(sources: CalendarSource[], from: Date, to: Date): WeekEventsState {
  const [state, setState] = useState<WeekEventsState>({ events: [], loading: true, errors: {}, cached: false })
  const live = sources.filter((s) => !s.deleted_at)
  const signature = live.map((s) => `${s.id}|${s.url}`).join(',')
  const weekKey = dayKey(from)
  const fromMs = from.getTime()
  const toMs = to.getTime()

  useEffect(() => {
    let cancelled = false
    const list = signature ? signature.split(',').map((p) => ({ id: p.split('|')[0]!, url: p.slice(p.indexOf('|') + 1) })) : []
    const f = new Date(fromMs)
    const t = new Date(toMs)

    async function run() {
      const bySource = new Map<string, WeekEvent[]>()
      const errors: Record<string, string> = {}
      let cached = false

      for (const s of list) {
        const entry = await readIcsCache<CacheEntry>(`${s.id}:${weekKey}`)
        if (entry && entry.url === s.url) {
          bySource.set(s.id, toWeekEvents(s.id, entry.events, f, t))
          cached = true
        }
      }
      if (cancelled) return
      setState({ events: [...bySource.values()].flat(), loading: list.length > 0 && navigator.onLine, errors, cached })
      if (!navigator.onLine) return

      await Promise.all(
        list.map(async (s) => {
          try {
            const q = new URLSearchParams({ source: s.id, from: f.toISOString(), to: t.toISOString() })
            const res = await fetch(`/api/ics?${q}`, { cache: 'no-store' })
            const body = (await res.json().catch(() => null)) as { events?: IcsEventDto[]; error?: string } | null
            if (!res.ok || !body?.events) {
              errors[s.id] = body?.error ?? 'Calendar could not be loaded.'
              return
            }
            bySource.set(s.id, toWeekEvents(s.id, body.events, f, t))
            await writeIcsCache(`${s.id}:${weekKey}`, { url: s.url, fetchedAt: Date.now(), events: body.events } satisfies CacheEntry)
          } catch {
            errors[s.id] = 'Calendar could not be loaded.'
          }
        }),
      )
      if (cancelled) return
      setState({ events: [...bySource.values()].flat(), loading: false, errors, cached: false })
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [signature, weekKey, fromMs, toMs])

  return state
}
