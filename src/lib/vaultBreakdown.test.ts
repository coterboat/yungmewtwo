import { describe, expect, it } from 'vitest'
import type { SetSummary, SiteProduct } from './site.ts'
import type { VaultItem } from './user.ts'
import { quoteFor, valueItem } from './vault.ts'
import type { VaultRow } from './vaultFilter.ts'
import { breakdown } from './vaultBreakdown.ts'
import { movers, periodChange } from './vaultMovers.ts'

const set = (id: number, name: string): SetSummary => ({ id, name, abbr: 'X', lang: 'EN', released: '2026-01-01', supplemental: false, firstSeen: null, products: 0, cards: 0, sealedCount: 0, value: 0, chase: [] })
const product = (id: number, setId: number, rarity: string | undefined, price: number, changes: [number | null, number | null, number | null] = [null, null, null], kind: 'card' | 'sealed' = 'card'): SiteProduct => ({
  id,
  name: `P${id}`,
  set: setId,
  kind,
  rarity,
  v: { H: [price, price, changes[0], changes[1], changes[2]] },
})
const sets = new Map([
  [1, set(1, 'Alpha')],
  [2, set(2, 'Beta')],
  [3, set(3, 'Gamma')],
])
function row(id: string, p: SiteProduct, over: Partial<VaultItem> = {}): VaultRow {
  const item: VaultItem = { id, productId: p.id, qty: 1, status: 'have', added: '2026-10-01', ...over }
  return { item, product: p, set: sets.get(p.set), valued: valueItem(item, quoteFor(p, item.variant)) }
}

describe('breakdown', () => {
  const rows = [
    row('1', product(1, 1, 'Special Illustration Rare', 100)),
    row('2', product(2, 1, 'Common', 1), { qty: 5 }),
    row('3', product(3, 2, 'Special Illustration Rare', 50)),
    row('4', product(4, 3, undefined, 60, undefined, 'sealed')),
    row('5', product(5, 3, 'Rare', 10), { status: 'want' }), // wants are not value
    row('6', product(6, 3, 'Rare', 10), { status: 'sold', soldFor: 12 }),
  ]
  it('sums held value by set, biggest first, with shares', () => {
    const b = breakdown(rows, 'set')
    expect(b.map((s) => [s.label, s.value])).toEqual([
      ['Alpha', 105],
      ['Gamma', 60],
      ['Beta', 50],
    ])
    expect(b[0].share).toBeCloseTo(105 / 215, 9)
    expect(b[0].units).toBe(6)
  })
  it('sums held value by rarity, calling unrarity-d sealed "Sealed"', () => {
    const b = breakdown(rows, 'rarity')
    expect(b.map((s) => [s.label, s.value])).toEqual([
      ['Special Illustration Rare', 150],
      ['Sealed', 60],
      ['Common', 5],
    ])
  })
  it('folds the tail into Other past topN', () => {
    const b = breakdown(rows, 'set', 2)
    expect(b.map((s) => s.label)).toEqual(['Alpha', 'Gamma', 'Other'])
    expect(b[2].value).toBe(50)
  })
  it('is empty with nothing held', () => {
    expect(breakdown([row('w', product(1, 1, 'Rare', 5), { status: 'want' })], 'set')).toEqual([])
  })
})

describe('movers', () => {
  const rows = [
    row('a', product(1, 1, 'Rare', 120, [0, 0.2, 0.5]), { cost: 60 }), // +60 since added (100%); 7d +20%
    row('b', product(2, 1, 'Rare', 40, [0, -0.1, null]), { cost: 50, qty: 2 }), // -20 since added; 7d -10%
    row('c', product(3, 2, 'Rare', 10, [null, null, null]), { cost: 5 }), // +5; no 7d data
    row('d', product(4, 2, 'Rare', 30), {}), // no cost, no change
    row('e', product(5, 2, 'Rare', 99, [0, 0.3, null]), { status: 'want' }), // wants never count
  ]
  it('ranks winners and losers since added by dollars', () => {
    const m = movers(rows, 'added', 2)
    expect(m.up.map((x) => x.row.item.id)).toEqual(['a', 'c'])
    expect(m.down.map((x) => x.row.item.id)).toEqual(['b'])
    expect(m.up[0].change).toBe(60)
    expect(m.up[0].pct).toBeCloseTo(1, 9)
    expect(m.down[0].change).toBe(-20)
  })
  it('ranks 7-day movers from the price change', () => {
    const m = movers(rows, '7d', 3)
    expect(m.up.map((x) => x.row.item.id)).toEqual(['a'])
    expect(m.down.map((x) => x.row.item.id)).toEqual(['b'])
    // a: 120 now, was 100: +20. b: 2 x (40 now, was 44.44): about -8.9
    expect(m.up[0].change).toBeCloseTo(20, 6)
    expect(m.down[0].change).toBeCloseTo(2 * (40 - 40 / 0.9), 6)
    expect(m.up[0].pct).toBeCloseTo(0.2, 9)
  })
  it('limits the list length', () => {
    expect(movers(rows, 'added', 1).up).toHaveLength(1)
  })
  it('is empty when there is no history to compare', () => {
    const m = movers([row('x', product(9, 1, 'Rare', 5))], '7d', 3)
    expect(m.up).toEqual([])
    expect(m.down).toEqual([])
  })
})

describe('periodChange', () => {
  const rows = [row('a', product(1, 1, 'Rare', 120, [0, 0.2, 0.5]), { qty: 2 }), row('b', product(2, 1, 'Rare', 40, [0, null, -0.2])), row('c', product(3, 2, 'Rare', 10), { status: 'sold', soldFor: 4 })]
  it('sums the dollar change over a window across held items that have data', () => {
    const w7 = periodChange(rows, '7d')
    expect(w7.change).toBeCloseTo(2 * 20, 6)
    expect(w7.covered).toBe(1)
    const w30 = periodChange(rows, '30d')
    expect(w30.covered).toBe(2)
    expect(w30.change).toBeCloseTo(2 * (120 - 120 / 1.5) + (40 - 40 / 0.8), 6)
  })
  it('reports nothing covered when there is no data', () => {
    expect(periodChange([row('z', product(9, 1, 'Rare', 5))], '30d')).toEqual({ change: 0, covered: 0 })
  })
})
