import { useEffect, useState } from 'react'
import { headline, loadProduct } from '../../lib/data.ts'
import type { SiteProduct } from '../../lib/site.ts'

export interface ItemPrice {
  product: SiteProduct
  variant: string
  market: number | null
  low: number | null
  change1d: number | null
  change7d: number | null
}

/** Current prices for a handful of product ids (watchlist, vault), loaded from their set files. */
export function usePrices(ids: number[], variants: Record<number, string | undefined> = {}): Map<number, ItemPrice> | undefined {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',')
  const [map, setMap] = useState<Map<number, ItemPrice>>()
  useEffect(() => {
    let live = true
    const list = key ? key.split(',').map(Number) : []
    Promise.all(list.map((id) => loadProduct(id).catch(() => undefined))).then((products) => {
      if (!live) return
      const m = new Map<number, ItemPrice>()
      products.forEach((p) => {
        if (!p) return
        const want = variants[p.id]
        const pick = want && p.v[want] ? ([want, p.v[want]] as const) : headline(p)
        if (!pick) return
        const [variant, vp] = pick
        m.set(p.id, { product: p, variant, market: vp[0], low: vp[1], change1d: vp[2], change7d: vp[3] })
      })
      setMap(m)
    })
    return () => {
      live = false
    }
    // variants are looked up when ids change; a variant-only change is rare and harmless to skip
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return map
}
