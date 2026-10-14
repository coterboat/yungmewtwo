import { useEffect, useState } from 'react'
import { useData } from '../../lib/data.ts'
import type { DropsData } from '../../lib/drops.ts'
import type { AlertLogEntry } from '../../lib/dropsAlerts.ts'
import type { NewsFile } from '../../lib/dropsNews.ts'

export const useDrops = () => useData<DropsData>('drops.json')
export const useNews = () => useData<NewsFile>('news.json')
export const useAlertLog = () => useData<AlertLogEntry[]>('alerts.json')

/** Re-renders every `ms` with the current time. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** Today as YYYY-MM-DD in the viewer's own time zone. */
export function localToday(now: number = Date.now()): string {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const FILTER_KEY = 'yungmewtwo:drops-filters'

export interface DropFilters {
  lang: 'ALL' | 'EN' | 'JP'
  hideRumors: boolean
}

export function readFilters(): DropFilters {
  try {
    const raw = localStorage.getItem(FILTER_KEY)
    if (raw) return { lang: 'ALL', hideRumors: false, ...(JSON.parse(raw) as Partial<DropFilters>) }
  } catch {
    /* storage unavailable */
  }
  return { lang: 'ALL', hideRumors: false }
}

export function saveFilters(f: DropFilters) {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(f))
  } catch {
    /* storage unavailable: the choice just won't stick */
  }
}
