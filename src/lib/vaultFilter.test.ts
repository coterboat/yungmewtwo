import { describe, expect, it } from 'vitest'
import type { SetSummary, SiteProduct } from './site.ts'
import type { VaultItem } from './user.ts'
import { quoteFor, valueItem } from './vault.ts'
import { DEFAULT_FILTERS, applyFilters, filterOptions, filtersFromParams, filtersToParams, isFiltered, sortRows, type Filters, type VaultRow } from './vaultFilter.ts'

const set = (id: number, name: string, lang: 'EN' | 'JP' = 'EN', released = '2026-01-01'): SetSummary => ({ id, name, abbr: name.slice(0, 3).toUpperCase(), lang, released, supplemental: false, firstSeen: null, products: 0, cards: 0, sealedCount: 0, value: 0, chase: [] })
const card = (id: number, setId: number, num: string, rarity: string, price: number | null): SiteProduct => ({ id, name: `Card ${id}`, set: setId, kind: 'card', num, rarity, v: price == null ? {} : { H: [price, price, null, null, null] } })
const sealed = (id: number, setId: number, price: number): SiteProduct => ({ id, name: `Box ${id}`, set: setId, kind: 'sealed', sealed: 'booster-box', v: { N: [price, price, null, null, null] } })

const sets = new Map([
  [1, set(1, 'Alpha', 'EN', '2026-03-01')],
  [2, set(2, 'Beta', 'EN', '2026-06-01')],
  [3, set(3, 'Gamma', 'JP', '2026-05-01')],
])

function row(id: string, product: SiteProduct | undefined, over: Partial<VaultItem> = {}): VaultRow {
  const item: VaultItem = { id, productId: product?.id ?? 0, qty: 1, status: 'have', added: '2026-10-01', ...over }
  return { item, product, set: product ? sets.get(product.set) : undefined, valued: valueItem(item, quoteFor(product, item.variant)) }
}

const rows: VaultRow[] = [
  row('a', card(1, 1, '010/100', 'Special Illustration Rare', 120), { cost: 60, added: '2026-10-05' }), // +100%
  row('b', card(2, 1, '002/100', 'Common', 2), { cost: 4, added: '2026-10-02' }), // -50%
  row('c', card(3, 2, '150/200', 'Ultra Rare', 30), { cost: 25, added: '2026-10-09' }), // +20%
  row('d', sealed(4, 2, 300), { cost: 161, added: '2026-10-01' }),
  row('e', card(5, 3, '001/050', 'Rare', 8), { added: '2026-10-07' }), // JP, no cost
  row('f', undefined, { added: '2026-10-08' }), // product unknown
]

const f = (over: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...over })
const ids = (rs: VaultRow[]) => rs.map((r) => r.item.id)

describe('applyFilters', () => {
  it('passes everything by default', () => {
    expect(applyFilters(rows, DEFAULT_FILTERS)).toHaveLength(6)
  })
  it('filters by set, language and kind', () => {
    expect(ids(applyFilters(rows, f({ set: 1 })))).toEqual(['a', 'b'])
    expect(ids(applyFilters(rows, f({ lang: 'JP' })))).toEqual(['e'])
    expect(ids(applyFilters(rows, f({ kind: 'sealed' })))).toEqual(['d'])
    expect(ids(applyFilters(rows, f({ kind: 'card' })))).toEqual(['a', 'b', 'c', 'e'])
  })
  it('filters by rarity', () => {
    expect(ids(applyFilters(rows, f({ rarity: 'Ultra Rare' })))).toEqual(['c'])
  })
  it('filters by price band on the per-item market price', () => {
    expect(ids(applyFilters(rows, f({ price: 'lt5' })))).toEqual(['b'])
    expect(ids(applyFilters(rows, f({ price: '5to25' })))).toEqual(['e'])
    expect(ids(applyFilters(rows, f({ price: '25to100' })))).toEqual(['c'])
    expect(ids(applyFilters(rows, f({ price: 'gt100' })))).toEqual(['a', 'd'])
  })
  it('filters winners and losers by gain vs cost', () => {
    expect(ids(applyFilters(rows, f({ gain: 'win' })))).toEqual(['a', 'c', 'd'])
    expect(ids(applyFilters(rows, f({ gain: 'lose' })))).toEqual(['b'])
  })
  it('combines filters', () => {
    expect(ids(applyFilters(rows, f({ set: 1, gain: 'win' })))).toEqual(['a'])
  })
})

describe('sortRows', () => {
  it('sorts by value, biggest first', () => {
    expect(ids(sortRows(rows, 'value')).slice(0, 3)).toEqual(['d', 'a', 'c'])
  })
  it('sorts by gain percent with unknowns last', () => {
    expect(ids(sortRows(rows, 'gainPct'))).toEqual(['a', 'd', 'c', 'b', 'e', 'f'])
  })
  it('sorts by gain dollars', () => {
    expect(ids(sortRows(rows, 'gain')).slice(0, 3)).toEqual(['d', 'a', 'c'])
  })
  it('sorts newest first', () => {
    expect(ids(sortRows(rows, 'newest'))).toEqual(['c', 'f', 'e', 'a', 'b', 'd'])
  })
  it('sorts by set (newest set first) then card number, sealed after cards', () => {
    expect(ids(sortRows(rows, 'number'))).toEqual(['c', 'd', 'e', 'b', 'a', 'f'])
  })
  it('does not mutate its input', () => {
    const copy = [...rows]
    sortRows(rows, 'value')
    expect(rows).toEqual(copy)
  })
})

describe('filterOptions', () => {
  it('lists the sets, rarities and languages that are actually present', () => {
    const o = filterOptions(rows)
    expect(o.sets.map((s) => [s.id, s.count])).toEqual([
      [2, 2],
      [3, 1],
      [1, 2],
    ])
    expect(o.rarities.map((r) => r.rarity)).toEqual(expect.arrayContaining(['Common', 'Rare', 'Ultra Rare', 'Special Illustration Rare']))
    expect(o.langs).toEqual(['EN', 'JP'])
  })
})

describe('url round trip', () => {
  it('reads defaults from an empty query', () => {
    expect(filtersFromParams(new URLSearchParams(''))).toEqual(DEFAULT_FILTERS)
  })
  it('round-trips every filter', () => {
    const filters = f({ set: 2, lang: 'EN', kind: 'card', rarity: 'Ultra Rare', price: '25to100', gain: 'win', sort: 'gainPct' })
    const qs = filtersToParams(filters, new URLSearchParams('tab=have'))
    expect(qs.get('tab')).toBe('have')
    expect(filtersFromParams(qs)).toEqual(filters)
  })
  it('drops defaults from the query and ignores junk values', () => {
    const qs = filtersToParams(DEFAULT_FILTERS, new URLSearchParams('set=9&kind=card'))
    expect([...qs.keys()]).toEqual([])
    const parsed = filtersFromParams(new URLSearchParams('kind=banana&sort=nope&price=free&gain=maybe&lang=FR&set=abc'))
    expect(parsed).toEqual(DEFAULT_FILTERS)
  })
  it('knows when anything is filtered (the sort alone does not count)', () => {
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false)
    expect(isFiltered(f({ sort: 'gain' }))).toBe(false)
    expect(isFiltered(f({ rarity: 'Rare' }))).toBe(true)
  })
})
