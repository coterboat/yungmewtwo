// Loads the catalog data a vault needs, and only that: the index to find each product's set, then
// just those sets' product files, then price history for the sets of what's held.
import { useEffect, useMemo, useState } from 'react'
import { loadData, useIndex } from '../../lib/data.ts'
import type { SetHistory, SiteProduct } from '../../lib/site.ts'

export interface VaultCatalog {
  /** Requested products by id. */
  products: Map<number, SiteProduct>
  /** Full product list of every set that holds a requested product. */
  setProducts: Map<number, SiteProduct[]>
  /** Price history for the sets of `historyIds`. */
  histories: Map<number, SetHistory>
  loading: boolean
}

const EMPTY: VaultCatalog = { products: new Map(), setProducts: new Map(), histories: new Map(), loading: false }

export function useVaultCatalog(productIds: number[], historyIds: number[]): VaultCatalog {
  const idsKey = [...new Set(productIds)].sort((a, b) => a - b).join(',')
  const histKey = [...new Set(historyIds)].sort((a, b) => a - b).join(',')
  const want = useMemo(() => (idsKey ? idsKey.split(',').map(Number) : []), [idsKey])

  const en = useIndex(want.length ? 'EN' : null)
  const enSet = useMemo(() => {
    const m = new Map<number, number>()
    if (!en.data || !want.length) return m
    const need = new Set(want)
    for (const r of en.data) if (need.has(r[0])) m.set(r[0], r[2])
    return m
  }, [en.data, want])
  const needJp = !!en.data && want.some((id) => !enSet.has(id))
  const jp = useIndex(needJp ? 'JP' : null)
  const setOf = useMemo(() => {
    const m = new Map(enSet)
    if (jp.data) {
      const need = new Set(want.filter((id) => !m.has(id)))
      for (const r of jp.data) if (need.has(r[0])) m.set(r[0], r[2])
    }
    return m
  }, [enSet, jp.data, want])

  const indexReady = !want.length || (!!en.data && (!needJp || !!jp.data))
  const setIds = useMemo(() => [...new Set(setOf.values())].sort((a, b) => a - b), [setOf])
  const setKey = setIds.join(',')
  const histSetIds = useMemo(() => [...new Set(histKey ? histKey.split(',').map((id) => setOf.get(Number(id))).filter((s): s is number => s != null) : [])].sort((a, b) => a - b), [histKey, setOf])
  const histSetKey = histSetIds.join(',')

  const [loaded, setLoaded] = useState<{ key: string; map: Map<number, SiteProduct[]> }>({ key: '', map: new Map() })
  useEffect(() => {
    if (!indexReady || !setKey) return
    let live = true
    Promise.all(setIds.map((id) => loadData<SiteProduct[]>(`sets/${id}.json`).then((p) => [id, p] as const, () => [id, [] as SiteProduct[]] as const))).then((pairs) => {
      if (live) setLoaded({ key: setKey, map: new Map(pairs) })
    })
    return () => {
      live = false
    }
    // setIds is derived from setKey
  }, [indexReady, setKey, setIds])

  const [hist, setHist] = useState<{ key: string; map: Map<number, SetHistory> }>({ key: '', map: new Map() })
  useEffect(() => {
    if (!histSetKey) return
    let live = true
    Promise.all(histSetIds.map((id) => loadData<SetHistory>(`history/${id}.json`).then((h) => [id, h] as const, () => null))).then((pairs) => {
      if (live) setHist({ key: histSetKey, map: new Map(pairs.filter((p): p is readonly [number, SetHistory] => p != null)) })
    })
    return () => {
      live = false
    }
  }, [histSetKey, histSetIds])

  const products = useMemo(() => {
    const m = new Map<number, SiteProduct>()
    if (loaded.key !== setKey) return m
    const need = new Set(want)
    for (const list of loaded.map.values()) for (const p of list) if (need.has(p.id)) m.set(p.id, p)
    return m
  }, [loaded, setKey, want])

  if (!want.length) return EMPTY
  const ready = indexReady && loaded.key === setKey
  return { products, setProducts: ready ? loaded.map : EMPTY.setProducts, histories: histSetKey && hist.key === histSetKey ? hist.map : EMPTY.histories, loading: !ready }
}
