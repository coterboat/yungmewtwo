import { describe, expect, it } from 'vitest'
import type { SetHistory, SiteProduct } from './site.ts'
import type { VaultItem } from './user.ts'
import { csvEscape, heldItems, quoteFor, sliceRange, splitLot, summarize, targetGap, toCsv, valueItem, valueSeries, type Holding } from './vault.ts'

const product = (id: number, v: SiteProduct['v']): SiteProduct => ({ id, name: `P${id}`, set: 1, kind: 'card', v })
const item = (over: Partial<VaultItem> & Pick<VaultItem, 'id' | 'productId'>): VaultItem => ({ qty: 1, status: 'have', added: '2026-10-01', ...over })

describe('quoteFor', () => {
  const p = product(1, { N: [2, 1.5, 0.1, 0.2, 0.3], H: [20, 18, -0.05, 0.1, 0.4], R: [null, 5, null, null, null] })
  it('uses the item variant when the product has it', () => {
    expect(quoteFor(p, 'N')).toMatchObject({ variant: 'N', market: 2, low: 1.5, change7d: 0.2 })
  })
  it('falls back to the headline variant', () => {
    expect(quoteFor(p, undefined)?.variant).toBe('H')
    expect(quoteFor(p, 'ZZ')?.variant).toBe('H')
  })
  it('uses the lowest listing when there is no market price', () => {
    expect(quoteFor(p, 'R')).toMatchObject({ market: 5, low: 5 })
  })
  it('is undefined for unknown or unpriced products', () => {
    expect(quoteFor(undefined)).toBeUndefined()
    expect(quoteFor(product(2, {}))).toBeUndefined()
  })
})

describe('valueItem', () => {
  const q = { variant: 'H', market: 20, low: 18, change1d: null, change7d: null, change30d: null }
  it('values qty, cost and gain', () => {
    const v = valueItem(item({ id: 'a', productId: 1, qty: 3, cost: 12 }), q)
    expect(v.value).toBe(60)
    expect(v.costTotal).toBe(36)
    expect(v.gain).toBe(24)
    expect(v.gainPct).toBeCloseTo(24 / 36, 9)
  })
  it('has no gain without a recorded cost, but zero cost counts', () => {
    expect(valueItem(item({ id: 'a', productId: 1 }), q).gain).toBeNull()
    const free = valueItem(item({ id: 'a', productId: 1, cost: 0 }), q)
    expect(free.gain).toBe(20)
    expect(free.gainPct).toBeNull()
  })
  it('has no value without a price', () => {
    const v = valueItem(item({ id: 'a', productId: 1, cost: 5 }), undefined)
    expect(v.value).toBeNull()
    expect(v.gain).toBeNull()
  })
})

describe('summarize', () => {
  const q = (m: number) => ({ variant: 'H', market: m, low: m, change1d: null, change7d: null, change30d: null })
  const rows = [
    valueItem(item({ id: '1', productId: 1, qty: 2, cost: 10 }), q(30)), // value 60, cost 20
    valueItem(item({ id: '2', productId: 2, status: 'trade', cost: 100 }), q(90)), // value 90, cost 100
    valueItem(item({ id: '3', productId: 3 }), q(40)), // value 40, no cost
    valueItem(item({ id: '4', productId: 4 }), undefined), // no price
    valueItem(item({ id: '5', productId: 5, status: 'want' }), q(500)), // not held
    valueItem(item({ id: '6', productId: 6, status: 'sold', qty: 2, cost: 20, soldFor: 35 }), q(50)), // revenue 70, cost 40
    valueItem(item({ id: '7', productId: 7, status: 'sold', soldFor: 15 }), q(50)), // revenue 15, no cost
  ]
  const s = summarize(rows)
  it('totals held value across have and trade only', () => {
    expect(s.value).toBe(190)
    expect(s.heldUnits).toBe(5)
    expect(s.unpriced).toBe(1)
  })
  it('measures unrealized P&L only over items with a cost', () => {
    expect(s.cost).toBe(120)
    expect(s.costedValue).toBe(150)
    expect(s.unrealized).toBe(30)
    expect(s.unrealizedPct).toBeCloseTo(0.25, 9)
    expect(s.uncosted).toBe(2) // the $40 card and the unpriced one have no cost recorded
  })
  it('counts realized profit from sold items with a cost, and all revenue', () => {
    expect(s.soldRevenue).toBe(85)
    expect(s.realized).toBe(30)
    expect(s.soldUnits).toBe(3)
  })
  it('is all zeros for an empty vault', () => {
    const e = summarize([])
    expect(e.value).toBe(0)
    expect(e.unrealizedPct).toBeNull()
  })
})

describe('heldItems', () => {
  it('keeps have and trade', () => {
    const items = [item({ id: '1', productId: 1 }), item({ id: '2', productId: 2, status: 'trade' }), item({ id: '3', productId: 3, status: 'want' }), item({ id: '4', productId: 4, status: 'sold' })]
    expect(heldItems(items).map((i) => i.id)).toEqual(['1', '2'])
  })
})

describe('splitLot', () => {
  it('sells part of a lot and keeps the rest', () => {
    const out = splitLot([item({ id: 'a', productId: 1, qty: 5, cost: 10 })], 'a', 2, 18, 'sold-1')
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ id: 'a', qty: 3, status: 'have' })
    expect(out[1]).toMatchObject({ id: 'sold-1', qty: 2, status: 'sold', soldFor: 18, cost: 10, productId: 1 })
  })
  it('turns the whole lot into a sale', () => {
    const out = splitLot([item({ id: 'a', productId: 1, qty: 2 })], 'a', 2, 9, 'x')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'a', status: 'sold', soldFor: 9, qty: 2 })
  })
  it('clamps the sold quantity and leaves other items alone', () => {
    const other = item({ id: 'b', productId: 2 })
    const out = splitLot([item({ id: 'a', productId: 1, qty: 2 }), other], 'a', 9, 9, 'x')
    expect(out[0]).toMatchObject({ status: 'sold', qty: 2 })
    expect(out[1]).toBe(other)
  })
  it('does nothing when the item is gone', () => {
    const items = [item({ id: 'a', productId: 1 })]
    expect(splitLot(items, 'zzz', 1, 1, 'x')).toEqual(items)
  })
})

describe('value over time', () => {
  const h = (dates: string[], series: SetHistory['series']): SetHistory => ({ dates, series })
  it('degrades to a single point with one day of history', () => {
    const hs = new Map([[1, h(['2026-10-14'], { '1:H': [20] })]])
    const s = valueSeries([{ key: '1:H', setId: 1, qty: 2, fallback: 20 }], hs)
    expect(s.dates).toEqual(['2026-10-14'])
    expect(s.values).toEqual([40])
    expect(sliceRange(s, 7).values).toEqual([40])
  })
  it('sums qty x price across sets and dates', () => {
    const hs = new Map([
      [1, h(['d1', 'd2', 'd3'], { '1:H': [10, 12, 14] })],
      [2, h(['d1', 'd2', 'd3'], { '5:N': [1, 1, 3] })],
    ])
    const holdings: Holding[] = [
      { key: '1:H', setId: 1, qty: 2, fallback: 14 },
      { key: '5:N', setId: 2, qty: 10, fallback: 3 },
    ]
    expect(valueSeries(holdings, hs).values).toEqual([30, 34, 58])
  })
  it('carries the last price over gaps and back-fills the start', () => {
    const hs = new Map([[1, h(['d1', 'd2', 'd3', 'd4'], { '1:H': [null, 10, null, 14] })]])
    const s = valueSeries([{ key: '1:H', setId: 1, qty: 1, fallback: 14 }], hs)
    expect(s.values).toEqual([10, 10, 10, 14])
  })
  it('holds an item flat at its current price when it has no history', () => {
    const hs = new Map([[1, h(['d1', 'd2'], { '1:H': [10, 20] })]])
    const s = valueSeries(
      [
        { key: '1:H', setId: 1, qty: 1, fallback: 20 },
        { key: '9:H', setId: 1, qty: 1, fallback: 5 },
      ],
      hs,
    )
    expect(s.values).toEqual([15, 25])
    expect(s.flat).toBe(1)
    expect(s.covered).toBe(1)
  })
  it('lines up sets whose date lists differ', () => {
    const hs = new Map([
      [1, h(['d1', 'd2', 'd3'], { '1:H': [10, 10, 10] })],
      [2, h(['d2', 'd3'], { '2:H': [5, 6] })],
    ])
    const s = valueSeries(
      [
        { key: '1:H', setId: 1, qty: 1, fallback: 10 },
        { key: '2:H', setId: 2, qty: 1, fallback: 6 },
      ],
      hs,
    )
    expect(s.dates).toEqual(['d1', 'd2', 'd3'])
    expect(s.values).toEqual([15, 15, 16])
  })
  it('is empty with nothing held', () => {
    expect(valueSeries([], new Map())).toMatchObject({ dates: [], values: [] })
  })
  it('works with a year of days and slices to a range', () => {
    const dates = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10))
    const hs = new Map([[1, h(dates, { '1:H': dates.map((_, i) => 100 + i) })]])
    const s = valueSeries([{ key: '1:H', setId: 1, qty: 1, fallback: 464 }], hs)
    expect(s.dates).toHaveLength(365)
    const w = sliceRange(s, 30)
    expect(w.dates).toHaveLength(30)
    expect(w.values[29]).toBe(464)
    expect(sliceRange(s, null).dates).toHaveLength(365)
  })
})

describe('target gap', () => {
  it('is how far the price sits above the target', () => {
    const above = targetGap(60, 50)
    expect(above).toMatchObject({ gap: 10, hit: false })
    expect(above?.pct).toBeCloseTo(0.2, 9)
    const below = targetGap(45, 50)
    expect(below).toMatchObject({ gap: -5, hit: true })
    expect(below?.pct).toBeCloseTo(-0.1, 9)
    expect(targetGap(50, 50)?.hit).toBe(true)
  })
  it('needs a price and a target', () => {
    expect(targetGap(null, 50)).toBeNull()
    expect(targetGap(50, undefined)).toBeNull()
    expect(targetGap(50, 0)).toBeNull()
  })
})

describe('csv', () => {
  it('escapes commas, quotes and newlines', () => {
    expect(csvEscape('plain')).toBe('plain')
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
    expect(csvEscape('two\nlines')).toBe('"two\nlines"')
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(12.5)).toBe('12.5')
  })
  it('joins a header and rows', () => {
    expect(toCsv(['a', 'b'], [[1, 'x,y'], [null, 2]])).toBe('a,b\r\n1,"x,y"\r\n,2\r\n')
  })
  it('guards against spreadsheet formulas in user text', () => {
    expect(csvEscape('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvEscape('-5 off')).toBe("'-5 off")
    expect(csvEscape(-5)).toBe('-5')
  })
})
