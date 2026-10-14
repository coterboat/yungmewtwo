// React hooks shared by the Market, Set and Item screens.
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadData, useMeta } from './data.ts'
import { historyStatus, type HistoryStatus } from './market.ts'
import type { IndexRow, SiteProduct } from './site.ts'

/** Products by id, wherever they live (EN or JP): index rows locate the set file, the set file holds the prices. */
export function useProducts(ids: number[]): { products: Map<number, SiteProduct>; loading: boolean } {
  const key = useMemo(() => [...new Set(ids)].sort((a, b) => a - b).join(','), [ids])
  const [state, setState] = useState<{ key: string; products: Map<number, SiteProduct> }>({ key: '', products: new Map() })
  useEffect(() => {
    if (!key) return
    let live = true
    const want = new Set(key.split(',').map(Number))
    ;(async () => {
      const [en, jp] = await Promise.all([loadData<IndexRow[]>('index-en.json'), loadData<IndexRow[]>('index-jp.json')])
      const setOf = new Map<number, number>()
      for (const rows of [en, jp]) for (const r of rows) if (want.has(r[0])) setOf.set(r[0], r[2])
      const files = await Promise.all([...new Set(setOf.values())].map((s) => loadData<SiteProduct[]>(`sets/${s}.json`)))
      const out = new Map<number, SiteProduct>()
      for (const list of files) for (const p of list) if (want.has(p.id)) out.set(p.id, p)
      if (live) setState({ key, products: out })
    })().catch(() => live && setState({ key, products: new Map() }))
    return () => {
      live = false
    }
  }, [key])
  return { products: state.products, loading: !!key && state.key !== key }
}

/** What price history exists, from meta.json's snapshot dates. Undefined until meta loads. */
export function useHistoryStatus(): HistoryStatus | undefined {
  const { data } = useMeta()
  return useMemo(() => (data ? historyStatus(data.dates) : undefined), [data])
}

/** True at or above `minPx` viewport width (desktop layouts). */
export function useIsWide(minPx = 768): boolean {
  const query = `(min-width: ${minPx}px)`
  const [wide, setWide] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setWide(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return wide
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Eases a number up to `target` (from 0 the first time, from the last shown value after that). Jumps straight there under prefers-reduced-motion. */
export function useCountUp(target: number | null | undefined, ms = 700): number | null {
  const [shown, setShown] = useState<number | null>(() => (target == null ? null : reducedMotion() ? target : 0))
  const last = useRef(shown ?? 0)
  useEffect(() => {
    if (target == null) {
      setShown(null)
      return
    }
    if (reducedMotion()) {
      last.current = target
      setShown(target)
      return
    }
    const from = last.current
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms)
      const v = from + (target - from) * (1 - (1 - t) ** 3)
      last.current = v
      setShown(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return shown
}

/** Today as YYYY-MM-DD in local time. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
