import { describe, expect, it } from 'vitest'
import { buildTiers, eraDefaults, eraOf, findPullRates, hasRates, openEv, openVerdict, type PullRateFile } from './ev.ts'
import type { SiteProduct } from './site.ts'

const card = (id: number, rarity: string, price: number | null, variant = 'H'): SiteProduct => ({
  id,
  name: `Card ${id}`,
  set: 1,
  kind: 'card',
  rarity,
  v: price == null ? {} : { [variant]: [price, price * 0.9, null, null, null] },
})

const file: PullRateFile = {
  MEG: {
    name: 'Mega Evolution',
    tcgGroupId: 100,
    cardsPerPack: 10,
    confidence: 'med',
    tiers: [
      { rarity: 'Double Rare', perPack: 5, source: 's' },
      { rarity: 'Special Illustration Rare', perPack: 100, source: 's' },
      { rarity: 'Mega Hyper Rare', perPack: 1000, source: 's' },
    ],
  },
  PFL: {
    name: 'Phantasmal Flames',
    tcgGroupId: 101,
    cardsPerPack: 10,
    confidence: 'med',
    tiers: [
      { rarity: 'Double Rare', perPack: 5, source: 's' },
      { rarity: 'Special Illustration Rare', perPack: 80, source: 's' },
      { rarity: 'Mega Hyper Rare', perPack: 1200, source: 's' },
    ],
  },
  POR: {
    name: 'Perfect Order',
    tcgGroupId: 102,
    cardsPerPack: 10,
    confidence: 'med',
    tiers: [
      { rarity: 'Double Rare', perPack: 6, source: 's' },
      { rarity: 'Special Illustration Rare', perPack: 90, source: 's' },
      { rarity: 'Pikachu Rare', perPack: 1, source: 's' },
      { rarity: 'Poké Ball pattern', perPack: 3, source: 's', catalogRarity: null },
    ],
  },
  '30C': { name: '30th Celebration', tcgGroupId: 200, cardsPerPack: 5, confidence: 'low', tiers: [{ rarity: 'Double Rare', perPack: 4, source: 's' }] },
  DLR: { name: 'Delta Reign', tcgGroupId: 300, cardsPerPack: 10, confidence: null, tiers: [] },
}

describe('findPullRates', () => {
  it('prefers the TCGplayer group id over the abbreviation', () => {
    expect(findPullRates(file, { id: 200, abbr: '30C', lang: 'EN' })?.key).toBe('30C')
    // The Classic Collection group shares the abbreviation but is not the main set.
    expect(findPullRates(file, { id: 201, abbr: '30C', lang: 'EN' })).toBeUndefined()
  })
  it('falls back to abbreviation when the entry has no group id', () => {
    const f: PullRateFile = { ZZZ: { name: 'Z', cardsPerPack: 10, confidence: 'low', tiers: [] } }
    expect(findPullRates(f, { id: 5, abbr: 'ZZZ', lang: 'EN' })?.key).toBe('ZZZ')
  })
  it('skips Japanese sets', () => {
    expect(findPullRates(file, { id: 100, abbr: 'MEG', lang: 'JP' })).toBeUndefined()
  })
  it('knows when a set has no usable rates', () => {
    expect(hasRates(file.MEG)).toBe(true)
    expect(hasRates(file.DLR)).toBe(false)
    expect(hasRates({ ...file.MEG, tiers: [{ rarity: 'X', perPack: null, source: '' }] })).toBe(false)
  })
})

describe('tier stats', () => {
  const cards = [
    card(1, 'Double Rare', 1),
    card(2, 'Double Rare', 3),
    card(3, 'Double Rare', null),
    card(4, 'Special Illustration Rare', 100),
    card(5, 'Special Illustration Rare', 200, 'N'),
    card(6, 'Mega Hyper Rare', 300),
    card(7, 'Common', 0.1, 'N'),
  ]
  it('averages the priced cards of each rarity and weights by 1 in N', () => {
    const { tiers, skipped } = buildTiers(file.MEG, cards)
    expect(skipped).toEqual([])
    const dr = tiers.find((t) => t.rarity === 'Double Rare')!
    expect(dr.total).toBe(3)
    expect(dr.cards).toHaveLength(2)
    expect(dr.avg).toBeCloseTo(2, 9)
    expect(dr.p).toBeCloseTo(0.2, 9)
    expect(dr.evPerPack).toBeCloseTo(0.4, 9)
    expect(tiers.find((t) => t.rarity === 'Special Illustration Rare')!.evPerPack).toBeCloseTo(1.5, 9)
    expect(tiers.find((t) => t.rarity === 'Mega Hyper Rare')!.evPerPack).toBeCloseTo(0.3, 9)
  })
  it('skips tiers with no rate, no catalog match or no cards, and says why', () => {
    const rates = {
      ...file.POR,
      tiers: [...file.POR.tiers, { rarity: 'RGB Rare', perPack: null, source: 's' }],
    }
    const { tiers, skipped } = buildTiers(rates, cards)
    expect(tiers.map((t) => t.rarity)).toEqual(['Double Rare', 'Special Illustration Rare'])
    expect(skipped.map((s) => [s.rarity, s.reason])).toEqual([
      ['Pikachu Rare', 'no-cards'],
      ['Poké Ball pattern', 'no-catalog-match'],
      ['RGB Rare', 'no-rate'],
    ])
  })
  it('keeps a tier whose cards have no prices yet, valued at zero', () => {
    const { tiers } = buildTiers(file.MEG, [card(1, 'Double Rare', null), card(2, 'Special Illustration Rare', null), card(3, 'Mega Hyper Rare', null)])
    expect(tiers).toHaveLength(3)
    expect(tiers[0].avg).toBe(0)
    expect(tiers[0].pricedCount).toBe(0)
    expect(tiers[0].total).toBe(1)
  })
  it('can value cards net of selling fees', () => {
    const net = buildTiers(file.MEG, cards, (p) => p * 0.5)
    expect(net.tiers.find((t) => t.rarity === 'Double Rare')!.avg).toBeCloseTo(1, 9)
  })
})

describe('open EV', () => {
  it('multiplies per-pack EV by the pack count and adds bulk', () => {
    const { tiers } = buildTiers(file.MEG, [card(1, 'Double Rare', 2), card(2, 'Special Illustration Rare', 100), card(3, 'Mega Hyper Rare', 300)])
    const ev = openEv(tiers, 36, 0.25)
    // 2/5 + 100/100 + 300/1000 = 1.7 per pack
    expect(ev.hitPerPack).toBeCloseTo(1.7, 9)
    expect(ev.perPack).toBeCloseTo(1.95, 9)
    expect(ev.total).toBeCloseTo(36 * 1.95, 9)
    expect(ev.bulkTotal).toBeCloseTo(9, 9)
  })
})

describe('verdict', () => {
  it('keeps it sealed when sealed beats opening', () => {
    const v = openVerdict({ ev: 80, median: 60, sealed: 150 })
    expect(v.verdict).toBe('sealed')
    expect(v.headline).toBe('Keep it sealed')
  })
  it('opens when EV and the median both clear sealed', () => {
    expect(openVerdict({ ev: 200, median: 170, sealed: 150 }).verdict).toBe('open')
  })
  it('flags a gamble when EV is high but the median box loses', () => {
    const v = openVerdict({ ev: 180, median: 95, sealed: 150 })
    expect(v.verdict).toBe('gamble')
  })
  it('calls close results a toss-up', () => {
    expect(openVerdict({ ev: 152, median: 140, sealed: 150 }).verdict).toBe('toss-up')
  })
  it('has no verdict without a sealed price', () => {
    expect(openVerdict({ ev: 100, median: 90, sealed: null }).verdict).toBe('unknown')
  })
})

describe('era defaults', () => {
  const sets = [
    { id: 100, name: 'ME01: Mega Evolution' },
    { id: 101, name: 'ME02: Phantasmal Flames' },
    { id: 102, name: 'ME03: Perfect Order' },
    { id: 200, name: 'ME: 30th Celebration' },
    { id: 300, name: 'ME06: Delta Reign' },
  ]
  it('reads the era from the set name', () => {
    expect(eraOf('ME06: Delta Reign')).toBe('ME')
    expect(eraOf('ME: Ascended Heroes')).toBe('ME')
    expect(eraOf('SV10: Destined Rivals')).toBe('SV')
    expect(eraOf('SV: Black Bolt')).toBe('SV')
    expect(eraOf('SWSH12: Silver Tempest')).toBeNull()
    expect(eraOf('Celebrations')).toBeNull()
  })
  it('takes the median rate per rarity across same-era sets, only for rarities seen twice', () => {
    const d = eraDefaults(file, sets, 'ME')!
    expect(d.confidence).toBe('low')
    const by = Object.fromEntries(d.tiers.map((t) => [t.rarity, t.perPack]))
    expect(by['Double Rare']).toBe(5) // median of 5, 5, 6, 4
    expect(by['Special Illustration Rare']).toBe(90) // median of 100, 80, 90
    expect(by['Mega Hyper Rare']).toBe(1100) // median of 1000, 1200
    expect(by['Pikachu Rare']).toBeUndefined() // only one set has it
    expect(by['Poké Ball pattern']).toBeUndefined() // not a catalog rarity
    expect(d.derivedFrom).toEqual(expect.arrayContaining(['MEG', 'PFL', 'POR']))
  })
  it('has no defaults for an era with no data', () => {
    expect(eraDefaults(file, sets, 'SV')).toBeUndefined()
  })
})
