import { describe, expect, it } from 'vitest'
import type { SetSummary, SiteProduct } from './site.ts'
import { ownedBySet, setProgress, sortProgress } from './vaultSets.ts'

const set = (id: number, name: string): SetSummary => ({ id, name, abbr: 'XXX', lang: 'EN', released: '2026-01-01', supplemental: false, firstSeen: null, products: 0, cards: 0, sealedCount: 0, value: 0, chase: [] })
const card = (id: number, price: number | null, num = String(id)): SiteProduct => ({ id, name: `Card ${id}`, set: 1, kind: 'card', num, rarity: 'Common', v: price == null ? {} : { N: [price, price, null, null, null] } })
const box: SiteProduct = { id: 99, name: 'Booster Box', set: 1, kind: 'sealed', sealed: 'booster-box', v: { N: [150, 150, null, null, null] } }

const cards = [card(1, 5), card(2, 1), card(3, 20), card(4, null), card(5, 0.5)]
const s = set(1, 'ME05: Pitch Black')

describe('setProgress', () => {
  it('counts distinct owned cards against the set and lists what is missing, cheapest first', () => {
    const p = setProgress(s, [...cards, box], new Set([1, 3]))
    expect(p.owned).toBe(2)
    expect(p.total).toBe(5)
    expect(p.pct).toBeCloseTo(0.4, 9)
    expect(p.complete).toBe(false)
    expect(p.missing.map((m) => m.id)).toEqual([5, 2, 4])
    expect(p.missingCost).toBeCloseTo(1.5, 9)
    expect(p.unpricedMissing).toBe(1)
    expect(p.remaining).toBe(3)
  })
  it('ignores sealed products and ids that are not in the set', () => {
    const p = setProgress(s, [...cards, box], new Set([99, 12345]))
    expect(p.owned).toBe(0)
  })
  it('is complete when nothing is missing', () => {
    const p = setProgress(s, cards, new Set([1, 2, 3, 4, 5]))
    expect(p.complete).toBe(true)
    expect(p.missing).toEqual([])
    expect(p.pct).toBe(1)
    expect(p.missingCost).toBe(0)
  })
  it('handles an empty set file', () => {
    const p = setProgress(s, [], new Set([1]))
    expect(p.total).toBe(0)
    expect(p.pct).toBe(0)
    expect(p.complete).toBe(false)
  })
})

describe('ownedBySet', () => {
  it('groups owned card ids by set', () => {
    const m = ownedBySet([
      { productId: 1, set: 10 },
      { productId: 2, set: 10 },
      { productId: 2, set: 10 },
      { productId: 3, set: 11 },
    ])
    expect([...(m.get(10) ?? [])].sort()).toEqual([1, 2])
    expect([...(m.get(11) ?? [])]).toEqual([3])
  })
})

describe('sortProgress', () => {
  it('puts closest-to-done sets first, completed ones last', () => {
    const mk = (id: number, owned: number, total: number) => setProgress(set(id, `S${id}`), Array.from({ length: total }, (_, i) => card(id * 1000 + i, 1)), new Set(Array.from({ length: owned }, (_, i) => id * 1000 + i)))
    const out = sortProgress([mk(1, 2, 10), mk(2, 10, 10), mk(3, 9, 10), mk(4, 1, 100)])
    expect(out.map((p) => p.set.id)).toEqual([3, 1, 4, 2])
  })
})
