// Fetching the site's JSON (public/data/, built by scripts/build-site-data.ts) with a shared cache.
import { useEffect, useState } from 'react'
import type { IndexRow, Movers, SealedRow, SetHistory, SetSummary, SiteMeta, SiteProduct } from './site.ts'

const cache = new Map<string, Promise<unknown>>()

/** Fetches ./data/<path> once per page load; later callers share the same promise. */
export function loadData<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined
  if (!p) {
    p = fetch(`./data/${path}`).then((r) => {
      if (!r.ok) throw new Error(`${r.status} loading ${path}`)
      return r.json() as Promise<T>
    })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return p
}

export interface Loaded<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
}

export function useData<T>(path: string | null): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: undefined, error: undefined, loading: !!path })
  useEffect(() => {
    if (!path) {
      setState({ data: undefined, error: undefined, loading: false })
      return
    }
    let live = true
    setState((s) => ({ ...s, loading: true }))
    loadData<T>(path).then(
      (data) => live && setState({ data, error: undefined, loading: false }),
      (error: Error) => live && setState({ data: undefined, error, loading: false }),
    )
    return () => {
      live = false
    }
  }, [path])
  return state
}

export const useMeta = () => useData<SiteMeta>('meta.json')
export const useSets = () => useData<SetSummary[]>('sets.json')
export const useSealed = () => useData<SealedRow[]>('sealed.json')
export const useMovers = () => useData<Movers>('movers.json')
export const useSetProducts = (setId: number | null) => useData<SiteProduct[]>(setId ? `sets/${setId}.json` : null)
export const useSetHistory = (setId: number | null) => useData<SetHistory>(setId ? `history/${setId}.json` : null)
export const useIndex = (lang: 'EN' | 'JP' | null) => useData<IndexRow[]>(lang ? `index-${lang.toLowerCase()}.json` : null)

/** Map of set id -> summary, for labelling products with their set. */
export function useSetMap(): Map<number, SetSummary> | undefined {
  const { data } = useSets()
  const [map, setMap] = useState<Map<number, SetSummary>>()
  useEffect(() => {
    if (data) setMap(new Map(data.map((s) => [s.id, s])))
  }, [data])
  return map
}

/** Finds one product by id: index row first (to learn its set), then the set file. */
export async function loadProduct(id: number): Promise<SiteProduct | undefined> {
  for (const lang of ['en', 'jp']) {
    const rows = await loadData<IndexRow[]>(`index-${lang}.json`)
    const row = rows.find((r) => r[0] === id)
    if (row) return (await loadData<SiteProduct[]>(`sets/${row[2]}.json`)).find((p) => p.id === id)
  }
  return undefined
}

export function useProduct(id: number | null): Loaded<SiteProduct> {
  const [state, setState] = useState<Loaded<SiteProduct>>({ data: undefined, error: undefined, loading: !!id })
  useEffect(() => {
    if (!id) return
    let live = true
    setState({ data: undefined, error: undefined, loading: true })
    loadProduct(id).then(
      (data) => live && setState({ data, error: data ? undefined : new Error('Not found'), loading: false }),
      (error: Error) => live && setState({ data: undefined, error, loading: false }),
    )
    return () => {
      live = false
    }
  }, [id])
  return state
}

/** The headline (most valuable) variant of a product: [code, prices]. */
export function headline(p: SiteProduct): [string, SiteProduct['v'][string]] | undefined {
  let best: [string, SiteProduct['v'][string]] | undefined
  for (const [code, vp] of Object.entries(p.v)) {
    const m = vp[0] ?? vp[1] ?? -1
    const bm = best ? (best[1][0] ?? best[1][1] ?? -1) : -2
    if (m > bm) best = [code, vp]
  }
  return best
}
