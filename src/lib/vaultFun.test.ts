import { describe, expect, it } from 'vitest'
import type { SealedRow } from './site.ts'
import { buildUnits, countText, pickEquivalent, type EquivUnit } from './vaultFun.ts'

const units: EquivUnit[] = [
  { id: 'booster-box', one: 'Pitch Black booster box', many: 'Pitch Black booster boxes', price: 161.64 },
  { id: 'etb', one: 'Pitch Black ETB', many: 'Pitch Black ETBs', price: 49.99 },
  { id: 'bundle', one: 'Pitch Black booster bundle', many: 'Pitch Black booster bundles', price: 26.94 },
  { id: 'pack', one: 'Pitch Black pack', many: 'Pitch Black packs', price: 4.49 },
]

describe('countText', () => {
  it('uses one decimal below 10 and whole numbers above', () => {
    expect(countText(3.4166)).toBe('3.4')
    expect(countText(46.2)).toBe('46')
    expect(countText(2)).toBe('2')
    expect(countText(1.04)).toBe('1')
  })
})

describe('pickEquivalent', () => {
  it('picks the biggest unit you can afford at least one of', () => {
    const e = pickEquivalent(552, units)
    expect(e?.unit.id).toBe('booster-box')
    expect(e?.text).toBe('3.4 Pitch Black booster boxes')
  })
  it('steps down to smaller units for smaller sums', () => {
    expect(pickEquivalent(80, units)?.unit.id).toBe('etb')
    expect(pickEquivalent(80, units)?.text).toBe('1.6 Pitch Black ETBs')
    expect(pickEquivalent(30, units)?.unit.id).toBe('bundle')
    expect(pickEquivalent(9, units)?.unit.id).toBe('pack')
    expect(pickEquivalent(9, units)?.text).toBe('2 Pitch Black packs')
  })
  it('uses the singular for about one', () => {
    expect(pickEquivalent(162, units)?.text).toBe('1 Pitch Black booster box')
  })
  it('has nothing to say below one pack, or for zero and negative values', () => {
    expect(pickEquivalent(3, units)).toBeNull()
    expect(pickEquivalent(0, units)).toBeNull()
    expect(pickEquivalent(-50, units)).toBeNull()
    expect(pickEquivalent(100, [])).toBeNull()
  })
})

const row = (over: Partial<SealedRow> & Pick<SealedRow, 'id' | 'set' | 'sealed'>): SealedRow => ({ name: 'x', lang: 'EN', market: 100, low: 90, change7d: null, change30d: null, released: '2026-09-01', ...over })

describe('buildUnits', () => {
  const byType = { 'booster-box': { msrp: 161.64 }, etb: { msrp: 49.99 }, bundle: { msrp: 26.94 }, pack: { msrp: 4.49 } }
  const name = (id: number) => (id === 1 ? 'Pitch Black' : id === 2 ? 'Delta Reign' : 'Old Set')
  it('anchors on the newest released set that has a booster box, using MSRPs', () => {
    const rows = [
      row({ id: 1, set: 1, sealed: 'booster-box', released: '2026-09-26', msrp: 161.64 }),
      row({ id: 2, set: 1, sealed: 'etb', released: '2026-09-26', msrp: 49.99 }),
      row({ id: 3, set: 1, sealed: 'bundle', released: '2026-09-26' }),
      row({ id: 4, set: 1, sealed: 'pack', released: '2026-09-26', msrp: 4.49 }),
      row({ id: 5, set: 2, sealed: 'booster-box', released: '2026-11-06', presale: true }),
      row({ id: 6, set: 3, sealed: 'booster-box', released: '2026-01-01' }),
      row({ id: 7, set: 1, sealed: 'booster-box', lang: 'JP', released: '2026-10-01' }),
    ]
    const u = buildUnits(rows, name, byType, '2026-10-14')
    expect(u.map((x) => x.id)).toEqual(['booster-box', 'etb', 'bundle', 'pack'])
    expect(u[0]).toMatchObject({ one: 'Pitch Black booster box', many: 'Pitch Black booster boxes', price: 161.64 })
    expect(u[2].price).toBe(26.94) // row had no msrp: falls back to the by-type MSRP
  })
  it('uses generic names when no set has a booster box yet', () => {
    const u = buildUnits([], name, byType, '2026-10-14')
    expect(u.map((x) => x.one)).toEqual(['booster box', 'ETB', 'booster bundle', 'pack'])
  })
  it('skips units with no known MSRP', () => {
    const u = buildUnits([], name, { 'booster-box': { msrp: null }, etb: { msrp: 49.99 } }, '2026-10-14')
    expect(u.map((x) => x.id)).toEqual(['etb'])
  })
})
