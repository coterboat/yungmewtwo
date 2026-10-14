import { describe, expect, it } from 'vitest'
import type { MsrpSeed } from './market.ts'
import {
  addDays,
  buyState,
  closestToMsrp,
  compareNum,
  displayName,
  estimateSealedFlip,
  eur,
  expandQuery,
  filterRows,
  filtersFromParams,
  filtersToParams,
  findWatch,
  flipAtLow,
  groupSets,
  historyNote,
  historyStatus,
  isFiltering,
  lowCallout,
  msrpFor,
  msrpRows,
  NO_FILTERS,
  pickVariant,
  ratioLabel,
  rarityRank,
  releaseKnown,
  rangeStart,
  sellState,
  setValueSeries,
  sortProducts,
  splitMsrp,
  topCardKeys,
  variantOrder,
} from './market.ts'
import type { IndexRow, SealedRow, SetHistory, SetSummary, SiteProduct } from './site.ts'
import type { WatchItem } from './user.ts'

const fmt = (d: string) => d.slice(5)

describe('history honesty', () => {
  it('says when changes will appear with one day of history', () => {
    const s = historyStatus(['2026-10-14'])
    expect(s.count).toBe(1)
    expect(s.ready).toEqual({ 1: false, 7: false, 30: false })
    expect(s.appears).toEqual({ 1: '2026-10-15', 7: '2026-10-21', 30: '2026-11-13' })
    const note = historyNote(s, fmt)!
    expect(note).toContain('started 10-14')
    expect(note).toContain('1 day')
    expect(note).toContain('10-21')
    expect(note).toContain('11-13')
  })
  it('only lists the windows still pending', () => {
    const dates = ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']
    const s = historyStatus(dates)
    expect(s.ready).toEqual({ 1: true, 7: true, 30: false })
    const note = historyNote(s, fmt)!
    expect(note).not.toContain('7-day')
    expect(note).toContain('30-day')
  })
  it('stays quiet once a year of history exists', () => {
    const dates: string[] = []
    for (let i = 0; i < 365; i++) dates.push(addDays('2026-10-14', i))
    const s = historyStatus(dates)
    expect(s.ready[30]).toBe(true)
    expect(historyNote(s, fmt)).toBeNull()
  })
  it('handles an empty history', () => {
    const s = historyStatus([])
    expect(s.count).toBe(0)
    expect(historyNote(s, fmt)).toBeNull()
  })
  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-30', 7)).toBe('2027-01-06')
  })
})

describe('chart range', () => {
  const dates = ['2026-01-01', '2026-01-02', '2026-01-10', '2026-01-20', '2026-02-01']
  it('starts at the first date inside the window, tolerating gaps', () => {
    expect(rangeStart(dates, 31)).toBe(0)
    expect(rangeStart(dates, 30)).toBe(1)
    expect(rangeStart(dates, 14)).toBe(3)
    expect(rangeStart(dates, 1)).toBe(4)
    expect(rangeStart(dates, null)).toBe(0)
    expect(rangeStart([], 30)).toBe(0)
  })
})

describe('card numbers and rarity', () => {
  it('sorts numbers naturally, plain before prefixed, blank last', () => {
    const nums = ['116/084', '9/99', 'TG02/TG30', '', '010/099', 'SWSH001', 'TG01/TG30']
    expect([...nums].sort(compareNum)).toEqual(['9/99', '010/099', '116/084', 'SWSH001', 'TG01/TG30', 'TG02/TG30', ''])
  })
  it('ranks rarities from common up to hyper', () => {
    const order = ['Common', 'Uncommon', 'Rare', 'Holo Rare', 'Ultra Rare', 'Illustration Rare', 'Special Illustration Rare', 'Hyper Rare']
    const ranks = order.map(rarityRank)
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
    expect(new Set(ranks).size).toBe(order.length)
    expect(rarityRank('None')).toBe(0)
    expect(rarityRank(undefined)).toBe(0)
    expect(rarityRank('Some New Rarity')).toBeGreaterThan(0)
  })
})

const prod = (id: number, name: string, num: string, rarity: string, v: SiteProduct['v']): SiteProduct => ({ id, name, set: 1, kind: 'card', num, rarity, v })

describe('product sorting', () => {
  const products = [
    prod(1, 'A', '3/10', 'Rare', { N: [5, 4, null, 0.1, null] }),
    prod(2, 'B', '1/10', 'Common', { N: [0.2, 0.1, null, -0.2, null] }),
    prod(3, 'C', '2/10', 'Ultra Rare', { N: [10, 9, null, null, null], H: [40, 30, null, 0.5, null] }),
    prod(4, 'D', '4/10', 'Common', {}),
  ]
  it('sorts by number', () => {
    expect(sortProducts(products, 'num', 'asc').map((p) => p.id)).toEqual([2, 3, 1, 4])
  })
  it('sorts by headline price, unpriced last in both directions', () => {
    expect(sortProducts(products, 'price', 'desc').map((p) => p.id)).toEqual([3, 1, 2, 4])
    expect(sortProducts(products, 'price', 'asc').map((p) => p.id)).toEqual([2, 1, 3, 4])
  })
  it('sorts by the headline variant 7-day change with unknowns last', () => {
    expect(sortProducts(products, 'c7', 'desc').map((p) => p.id)).toEqual([3, 1, 2, 4])
  })
  it('sorts by rarity then price', () => {
    expect(sortProducts(products, 'rarity', 'desc').map((p) => p.id)).toEqual([3, 1, 2, 4])
  })
})

describe('variants', () => {
  it('orders variants N, H, R, then the rest', () => {
    expect(variantOrder(['R', 'H', 'N', '1H', 'U'])).toEqual(['N', 'H', 'R', 'U', '1H'])
  })
  it('picks the wanted variant or falls back to the headline one', () => {
    const p = prod(1, 'X', '1', 'Rare', { N: [1, 1, null, null, null], H: [9, 8, null, null, null] })
    expect(pickVariant(p, 'N')).toBe('N')
    expect(pickVariant(p, 'zz')).toBe('H')
    expect(pickVariant(p, null)).toBe('H')
    expect(pickVariant(prod(2, 'Y', '1', 'Rare', {}), 'H')).toBeUndefined()
  })
})

describe('listing callout', () => {
  it('flags a low listing at 80% of market or less', () => {
    expect(lowCallout(100, 80)?.pct).toBeCloseTo(-0.2)
    expect(lowCallout(100, 60)?.pct).toBeCloseTo(-0.4)
    expect(lowCallout(100, 81)).toBeNull()
  })
  it('ignores pennies and missing prices', () => {
    expect(lowCallout(0.5, 0.1)).toBeNull()
    expect(lowCallout(null, 5)).toBeNull()
    expect(lowCallout(10, null)).toBeNull()
  })
  it('estimates a flip from the lowest listing after fees', () => {
    expect(flipAtLow(100, 70)).toBeCloseTo(100 * (1 - 0.1325) - 0.3 - 1.25 - 70, 2)
    expect(flipAtLow(100, null)).toBeNull()
  })
})

describe('watch targets', () => {
  it('measures distance to a buy target', () => {
    const s = buyState(50, 40)!
    expect(s.hit).toBe(false)
    expect(s.gap).toBeCloseTo(10)
    expect(s.needPct).toBeCloseTo(-0.2)
    expect(s.ratio).toBeCloseTo(0.8)
  })
  it('is hit at or below the target', () => {
    expect(buyState(40, 40)!.hit).toBe(true)
    expect(buyState(30, 40)!.ratio).toBe(1)
  })
  it('measures a sell target', () => {
    const s = sellState(80, 100)!
    expect(s.hit).toBe(false)
    expect(s.needPct).toBeCloseTo(0.25)
    expect(s.ratio).toBeCloseTo(0.8)
    expect(sellState(120, 100)!.hit).toBe(true)
  })
  it('returns null without a market or target', () => {
    expect(buyState(null, 40)).toBeNull()
    expect(buyState(40, undefined)).toBeNull()
    expect(sellState(40, 0)).toBeNull()
  })
  const w = (by: string, productId: number, variant?: string): WatchItem => ({ id: `${by}${productId}${variant}`, by, productId, variant, added: '2026-10-14' })
  it('finds my watch for a product and variant', () => {
    const items = [w('alex', 1, 'H'), w('alex', 1, 'N'), w('cousin', 1, 'H'), w('alex', 2)]
    expect(findWatch(items, 'alex', 1, 'N')?.variant).toBe('N')
    expect(findWatch(items, 'alex', 1, 'R')).toBeUndefined()
    expect(findWatch(items, 'alex', 2, 'H')?.productId).toBe(2)
    expect(findWatch(items, 'cousin', 1, 'H')?.by).toBe('cousin')
  })
})

const sealedRow = (id: number, market: number | null, msrp: number | undefined, extra: Partial<SealedRow> = {}): SealedRow => ({
  id,
  name: `S${id}`,
  set: 1,
  lang: 'EN',
  sealed: 'etb',
  packs: 9,
  msrp,
  market,
  low: null,
  change7d: null,
  change30d: null,
  ...extra,
})

describe('sealed vs MSRP', () => {
  const rows = [
    sealedRow(1, 150, 49.99),
    sealedRow(2, 49.99, 49.99),
    sealedRow(3, 40, 49.99),
    sealedRow(4, 52, 49.99),
    sealedRow(5, 90, undefined),
    sealedRow(6, null, 49.99),
    sealedRow(7, 300, 100, { lang: 'JP' }),
    sealedRow(8, 100, 26.94, { sealed: 'bundle', packs: 6 }),
  ]
  it('keeps EN products with both a market and an MSRP', () => {
    expect(msrpRows(rows).map((r) => r.row.id)).toEqual([1, 2, 3, 4, 8])
  })
  it('computes ratio and per-pack cost', () => {
    const r = msrpRows(rows).find((x) => x.row.id === 1)!
    expect(r.ratio).toBeCloseTo(3.0006, 3)
    expect(r.perPack).toBeCloseTo(150 / 9)
  })
  it('splits into above and at-or-under, ordered', () => {
    const { above, under } = splitMsrp(msrpRows(rows), 'ratio')
    expect(above.map((r) => r.row.id)).toEqual([8, 1])
    expect(under.map((r) => r.row.id)).toEqual([3, 2])
  })
  it('can order by estimated profit instead', () => {
    const { above } = splitMsrp(msrpRows(rows), 'profit')
    expect(above[0].row.id).toBe(1)
    expect(above[0].est).toBeGreaterThan(above[1].est)
  })
  it('drops displays, cases and combo listings, which would be compared against a single unit MSRP', () => {
    const r = [
      sealedRow(1, 2000, 26.94, { name: 'Ascended Heroes Booster Bundle Display', sealed: 'bundle' }),
      sealedRow(2, 100, 26.94, { name: 'X Booster Bundle', sealed: 'bundle' }),
      sealedRow(3, 150, 26.94, { name: 'X Booster Bundle + Surprise Box Bundle (Sam\'s Club)', sealed: 'bundle' }),
    ]
    expect(msrpRows(r).map((x) => x.row.id)).toEqual([2])
  })
  it('lists the closest to MSRP first', () => {
    const rows = msrpRows([sealedRow(1, 150, 49.99), sealedRow(2, 55, 49.99), sealedRow(3, 90, 49.99)])
    expect(closestToMsrp(rows, 2).map((r) => r.row.id)).toEqual([2, 3])
  })
  const seed: MsrpSeed = {
    byType: { etb: { msrp: 49.99, confidence: 'high' }, booster: { msrp: 1, confidence: 'med' }, 'booster-box': { msrp: 161.64, confidence: 'med' }, collection: { msrp: 14.99, confidence: 'med' } },
    byProduct: { '10': { msrp: 39.99, confidence: 'high' }, '11': { msrp: 9.99, confidence: 'low' } },
  }
  it('trusts uniform types and explicit product entries, not wide-spread types', () => {
    expect(msrpFor({ id: 1, name: 'A Elite Trainer Box', sealed: 'etb', msrp: 49.99 }, seed)).toEqual({ msrp: 49.99, conf: 'high' })
    expect(msrpFor({ id: 2, name: 'A Booster Box', sealed: 'booster-box', msrp: 161.64 }, seed)).toEqual({ msrp: 161.64, conf: 'med' })
    expect(msrpFor({ id: 3, name: 'A Poster Collection', sealed: 'collection', msrp: 14.99 }, seed)).toBeNull()
    expect(msrpFor({ id: 10, name: 'A Premium Collection', sealed: 'collection', msrp: 39.99 }, seed)).toEqual({ msrp: 39.99, conf: 'high' })
    expect(msrpFor({ id: 11, name: 'A Mini Tin', sealed: 'tin', msrp: 9.99 }, seed)).toEqual({ msrp: 9.99, conf: 'low' })
  })
  it('falls back to the plain MSRP when the seed has not loaded, and ignores products without one', () => {
    expect(msrpFor({ id: 3, name: 'A Poster Collection', sealed: 'collection', msrp: 14.99 }, undefined)).toEqual({ msrp: 14.99, conf: undefined })
    expect(msrpFor({ id: 4, name: 'No MSRP Box', sealed: 'etb' }, seed)).toBeNull()
    expect(msrpFor({ id: 5, name: 'Pitch Black Booster Box Case', sealed: 'booster-box', msrp: 161.64 }, seed)).toBeNull()
  })
  it('applies the seed to whole lists', () => {
    const r = [sealedRow(3, 300, 14.99, { sealed: 'collection' }), sealedRow(10, 300, 39.99, { sealed: 'collection' })]
    expect(msrpRows(r, 'EN', seed).map((x) => x.row.id)).toEqual([10])
    expect(msrpRows(r, 'EN', seed)[0].conf).toBe('high')
  })
  it('subtracts fees and shipping from a flip at MSRP', () => {
    const est = estimateSealedFlip(150, 49.99, 'etb')
    expect(est).toBeCloseTo(150 * (1 - 0.1325) - 0.3 - 7 - 49.99, 1)
  })
})

describe('sets', () => {
  const set = (id: number, released: string, extra: Partial<SetSummary> = {}): SetSummary => ({
    id,
    name: `Set ${id}`,
    abbr: `S${id}`,
    lang: 'EN',
    released,
    supplemental: false,
    firstSeen: null,
    products: 10,
    cards: 10,
    sealedCount: 0,
    value: 100,
    chase: [],
    ...extra,
  })
  const sets = [
    set(1, '2026-11-06'),
    set(2, '2026-07-17'),
    set(3, '2026-10-14', { value: 500 }),
    set(4, '2026-10-14', { value: 900 }),
    set(5, '2024-01-01'),
    set(6, '2026-09-01', { supplemental: true }),
    set(7, '2026-08-01', { lang: 'JP' }),
    set(8, '2026-10-20', { firstSeen: '2026-10-20' }),
  ]
  it('treats the first-pull date as unknown unless the set was first seen later', () => {
    expect(releaseKnown(sets[2], '2026-10-14')).toBe(false)
    expect(releaseKnown(sets[0], '2026-10-14')).toBe(true)
    expect(releaseKnown(sets[7], '2026-10-14')).toBe(true)
    expect(releaseKnown(sets[2], undefined)).toBe(true)
  })
  const base = { lang: 'EN' as const, trackingStart: '2026-10-14', today: '2026-10-14', query: '', showExtras: false }
  it('groups upcoming, released newest first, and undated by value', () => {
    const g = groupSets(sets, base)
    expect(g.upcoming.map((s) => s.id)).toEqual([8, 1])
    expect(g.released.map((s) => s.id)).toEqual([2, 5])
    expect(g.undated.map((s) => s.id)).toEqual([4, 3])
  })
  it('hides extras behind the toggle and filters by language and text', () => {
    expect(groupSets(sets, { ...base, showExtras: true }).released.map((s) => s.id)).toEqual([6, 2, 5])
    expect(groupSets(sets, { ...base, lang: 'JP' }).released.map((s) => s.id)).toEqual([7])
    expect(groupSets(sets, { ...base, query: 'set 2' }).released.map((s) => s.id)).toEqual([2])
    expect(groupSets(sets, { ...base, query: 's5' }).released.map((s) => s.id)).toEqual([5])
  })
})

describe('set value line', () => {
  const products = Array.from({ length: 25 }, (_, i) => prod(100 + i, `C${i}`, `${i + 1}/25`, 'Rare', { N: [i + 1, null, null, null, null] }))
  it('picks the top cards by headline price', () => {
    const keys = topCardKeys(products, 20)
    expect(keys).toHaveLength(20)
    expect(keys[0]).toBe('124:N')
    expect(keys).not.toContain('100:N')
  })
  it('sums per day and drops days with thin coverage', () => {
    const keys = ['1:N', '2:N', '3:N', '4:N', '5:N']
    const h: SetHistory = {
      dates: ['a', 'b', 'c'],
      series: {
        '1:N': [10, 10, null],
        '2:N': [10, 10, null],
        '3:N': [10, null, null],
        '4:N': [10, 10, 10],
        '5:N': [10, 10, null],
      },
    }
    expect(setValueSeries(h, keys)).toEqual([50, 40, null])
  })
})

describe('labels', () => {
  it('drops the embedded collector number from a product name', () => {
    expect(displayName('Mega Darkrai ex - 116/084')).toBe('Mega Darkrai ex')
    expect(displayName('Giratina - 97/214 (Cosmos Holo)')).toBe('Giratina (Cosmos Holo)')
    expect(displayName('Pikachu')).toBe('Pikachu')
    expect(displayName('Champions Festival - SM231 (World Championships 2019) [Staff]')).toBe('Champions Festival (World Championships 2019) [Staff]')
  })
  it('formats euros and ratios', () => {
    expect(eur(4.5)).toBe('€4.50')
    expect(eur(182.08)).toBe('€182')
    expect(eur(null)).toBe('—')
    expect(ratioLabel(3.0006)).toBe('×3.0')
    expect(ratioLabel(12.4)).toBe('×12')
  })
})

describe('search state in the URL', () => {
  it('round-trips filters and leaves other params alone', () => {
    const f = { q: 'charizard ex', kind: 'c' as const, set: 24688, rarity: 'Ultra Rare', min: 5, max: 250.5, sort: 'up' as const }
    const params = filtersToParams(f, new URLSearchParams('tab=sets'))
    expect(params.get('tab')).toBe('sets')
    expect(filtersFromParams(params)).toEqual(f)
  })
  it('drops defaults and tolerates junk', () => {
    expect(filtersToParams(NO_FILTERS, new URLSearchParams('q=old&kind=s')).toString()).toBe('')
    const junk = filtersFromParams(new URLSearchParams('kind=x&set=abc&min=-4&sort=weird&max=7'))
    expect(junk).toEqual({ ...NO_FILTERS, max: 7 })
  })
  it('only counts real filters as filtering', () => {
    expect(isFiltering(NO_FILTERS)).toBe(false)
    expect(isFiltering({ ...NO_FILTERS, sort: 'up' })).toBe(false)
    expect(isFiltering({ ...NO_FILTERS, q: ' ' })).toBe(false)
    expect(isFiltering({ ...NO_FILTERS, rarity: 'Rare' })).toBe(true)
  })
})

describe('search shorthand', () => {
  it('expands collector abbreviations', () => {
    expect(expandQuery('umbreon sir')).toBe('umbreon special illustration rare')
    expect(expandQuery('delta reign etb')).toBe('delta reign elite trainer box')
    expect(expandQuery('pc etb prismatic')).toBe('pokemon center elite trainer box prismatic')
    expect(expandQuery('bb perfect order')).toBe('booster box perfect order')
    expect(expandQuery('charizard ir')).toBe('charizard illustration rare')
  })
  it('only expands whole words and leaves everything else alone', () => {
    expect(expandQuery('iron valiant')).toBe('iron valiant')
    expect(expandQuery('pc')).toBe('pc')
    expect(expandQuery('Mega Darkrai ex')).toBe('Mega Darkrai ex')
  })
  it('finds cards by shorthand through the whole search', () => {
    const rows: IndexRow[] = [
      [1, 'Umbreon ex', 1, 'c', '161/131', 'Special Illustration Rare', 'N', 1270, null],
      [2, 'Umbreon V', 1, 'c', '094/203', 'Ultra Rare', 'N', 5, null],
      [3, 'Delta Reign Elite Trainer Box', 2, 's', '', '', 'N', 80, null],
    ]
    expect(filterRows(rows, { ...NO_FILTERS, q: 'umbreon sir' }, undefined).rows.map((r) => r[0])).toEqual([1])
    expect(filterRows(rows, { ...NO_FILTERS, q: 'delta reign etb' }, undefined).rows.map((r) => r[0])).toEqual([3])
  })
})

describe('market search', () => {
  const row = (id: number, name: string, set: number, kind: 'c' | 's', rarity: string, market: number | null, ch: number | null): IndexRow => [id, name, set, kind, '1/1', rarity, 'N', market, ch]
  const rows: IndexRow[] = [
    row(1, 'Charizard ex', 10, 'c', 'Ultra Rare', 100, 0.2),
    row(2, 'Charizard', 11, 'c', 'Rare', 30, -0.1),
    row(3, 'Charizard Elite Trainer Box', 10, 's', '', 120, 0.05),
    row(4, 'Pikachu', 10, 'c', 'Common', 1, null),
    row(5, 'Pikachu VMAX', 11, 'c', 'Ultra Rare', 8, 0.5),
    row(6, 'Mystery', 11, 'c', 'Rare', null, null),
  ]
  const f = (patch: Partial<typeof NO_FILTERS>) => ({ ...NO_FILTERS, ...patch })
  const ids = (r: { rows: IndexRow[] }) => r.rows.map((x) => x[0])
  it('filters by kind, set, rarity and price range', () => {
    expect(ids(filterRows(rows, f({ kind: 's' }), undefined))).toEqual([3])
    expect(ids(filterRows(rows, f({ set: 11 }), undefined)).sort()).toEqual([2, 5, 6])
    expect(ids(filterRows(rows, f({ rarity: 'Ultra Rare' }), undefined)).sort()).toEqual([1, 5])
    expect(ids(filterRows(rows, f({ min: 5, max: 110 }), undefined)).sort()).toEqual([1, 2, 5])
  })
  it('searches words and ranks name hits first', () => {
    const r = filterRows(rows, f({ q: 'charizard' }), undefined)
    expect(ids(r).sort()).toEqual([1, 2, 3])
    expect(r.total).toBe(3)
  })
  it('sorts by price and by 7-day change, unknowns last', () => {
    expect(ids(filterRows(rows, f({ sort: 'price-desc' }), undefined))).toEqual([3, 1, 2, 5, 4, 6])
    expect(ids(filterRows(rows, f({ sort: 'price-asc' }), undefined))).toEqual([4, 5, 2, 1, 3, 6])
    expect(ids(filterRows(rows, f({ sort: 'up' }), undefined))).toEqual([5, 1, 3, 2, 4, 6])
    expect(ids(filterRows(rows, f({ sort: 'down' }), undefined))).toEqual([2, 3, 1, 5, 4, 6])
  })
  it('caps the result list but reports the real total', () => {
    const r = filterRows(rows, f({}), undefined, 2)
    expect(r.rows).toHaveLength(2)
    expect(r.total).toBe(6)
  })
})
