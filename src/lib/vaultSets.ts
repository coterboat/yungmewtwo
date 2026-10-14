// Set completion: how many of a set's cards you own, what's missing, and what it would cost to
// finish. "Owned" counts distinct cards (any printing, any quantity) among what you hold.
import { cardPrice } from './ev.ts'
import type { SetSummary, SiteProduct } from './site.ts'

export interface MissingCard {
  id: number
  name: string
  num?: string
  rarity?: string
  /** Market price of the headline printing; null if unpriced. */
  price: number | null
}

export interface SetProgress {
  set: SetSummary
  owned: number
  total: number
  /** owned / total (0 when the set file is empty). */
  pct: number
  complete: boolean
  remaining: number
  /** Missing cards, cheapest first, unpriced last. */
  missing: MissingCard[]
  /** Sum of the priced missing cards: roughly what finishing the set costs at market. */
  missingCost: number
  unpricedMissing: number
}

export function setProgress(set: SetSummary, setProducts: SiteProduct[], ownedIds: ReadonlySet<number>): SetProgress {
  const cards = setProducts.filter((p) => p.kind === 'card')
  const missing: MissingCard[] = []
  let owned = 0
  for (const c of cards) {
    if (ownedIds.has(c.id)) owned++
    else missing.push({ id: c.id, name: c.name, num: c.num, rarity: c.rarity, price: cardPrice(c) })
  }
  missing.sort((a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY) || a.id - b.id)
  const total = cards.length
  return {
    set,
    owned,
    total,
    pct: total ? owned / total : 0,
    complete: total > 0 && missing.length === 0,
    remaining: missing.length,
    missing,
    missingCost: missing.reduce((s, m) => s + (m.price ?? 0), 0),
    unpricedMissing: missing.filter((m) => m.price == null).length,
  }
}

/** Owned card ids grouped by set id. */
export function ownedBySet(cards: Array<{ productId: number; set: number }>): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>()
  for (const c of cards) {
    const s = out.get(c.set)
    if (s) s.add(c.productId)
    else out.set(c.set, new Set([c.productId]))
  }
  return out
}

/** Closest to done first (fewest cards left to find), finished sets at the end. */
export function sortProgress(list: SetProgress[]): SetProgress[] {
  return [...list].sort((a, b) => Number(a.complete) - Number(b.complete) || b.pct - a.pct || a.set.name.localeCompare(b.set.name))
}
