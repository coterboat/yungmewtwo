import { describe, expect, it } from 'vitest'
import { asMsrpUnits, boxesLabel, packsAsProducts, DEFAULT_UNITS, oddsLabel, pullOdds, pullSetFor, shareOfValue, sig2, tierFor, unitsFromSeed, type PullRates } from './market-pulls.ts'

const rates: PullRates = {
  PBL: {
    name: 'Pitch Black',
    tcgGroupId: 24688,
    cardsPerPack: 10,
    confidence: 'med',
    tiers: [
      { rarity: 'Special Illustration Rare', perPack: 80 },
      { rarity: 'Mega Hyper Rare', perPack: 1081 },
      { rarity: 'Poké Ball pattern', perPack: 3, catalogRarity: null },
      { rarity: 'RGB Rare', perPack: null },
    ],
  },
  '30C': { name: '30th Celebration', tcgGroupId: 24722, cardsPerPack: 5, confidence: 'low', tiers: [] },
  OLD: { name: 'No group id', cardsPerPack: 10, confidence: 'low', tiers: [] },
}

describe('finding pull rates for a set', () => {
  it('matches by TCGplayer group id first', () => {
    expect(pullSetFor(rates, { id: 24688, abbr: 'XXX' })?.name).toBe('Pitch Black')
    expect(pullSetFor(rates, { id: 24837, abbr: '30C' })).toBeUndefined()
  })
  it('falls back to the abbreviation only for entries without a group id', () => {
    expect(pullSetFor(rates, { id: 1, abbr: 'OLD' })?.name).toBe('No group id')
    expect(pullSetFor(rates, { id: 1, abbr: 'PBL' })).toBeUndefined()
    expect(pullSetFor(undefined, { id: 24688, abbr: 'PBL' })).toBeUndefined()
  })
  it('only uses tiers that match a printed rarity and have a measured rate', () => {
    const ps = rates.PBL
    expect(tierFor(ps, 'Special Illustration Rare')?.perPack).toBe(80)
    expect(tierFor(ps, 'Poké Ball pattern')).toBeUndefined()
    expect(tierFor(ps, 'RGB Rare')).toBeUndefined()
    expect(tierFor(ps, 'Common')).toBeUndefined()
    expect(tierFor(ps, undefined)).toBeUndefined()
  })
})

describe('odds for one card', () => {
  it('divides the tier rate by how many cards share the rarity', () => {
    // Mega Darkrai ex SIR: 6 SIRs at 1 in 80 packs -> about 1 in 480
    const o = pullOdds(rates.PBL, 'Special Illustration Rare', 6, 140.11, DEFAULT_UNITS)!
    expect(o.packsForOne).toBe(480)
    expect(o.boxes).toBeCloseTo(13.33, 1)
    expect(o.etbs).toBeCloseTo(53.33, 1)
    expect(o.costToPull).toBeCloseTo(480 * 4.49, 2)
    expect(o.buyInPacks).toBeCloseTo(140.11 / 4.49, 2)
    expect(o.cheaperToBuy).toBe(true)
    expect(o.confidence).toBe('med')
  })
  it('works without a market price', () => {
    const o = pullOdds(rates.PBL, 'Mega Hyper Rare', 1, null, DEFAULT_UNITS)!
    expect(o.packsForOne).toBe(1081)
    expect(o.buyInPacks).toBeNull()
    expect(o.cheaperToBuy).toBeNull()
  })
  it('returns null when there is no tier or no cards of the rarity', () => {
    expect(pullOdds(rates.PBL, 'Common', 6, 1, DEFAULT_UNITS)).toBeNull()
    expect(pullOdds(rates.PBL, 'Special Illustration Rare', 0, 1, DEFAULT_UNITS)).toBeNull()
  })
})

describe('plain-language numbers', () => {
  it('rounds to two significant figures', () => {
    expect(sig2(480)).toBe(480)
    expect(sig2(498)).toBe(500)
    expect(sig2(2520)).toBe(2500)
    expect(sig2(13.33)).toBe(13)
    expect(sig2(2.84)).toBe(2.8)
    expect(sig2(0.87)).toBe(0.87)
  })
  it('words the odds', () => {
    expect(oddsLabel(480)).toBe('1 in ~480 packs')
    expect(oddsLabel(2520)).toBe('1 in ~2,500 packs')
    expect(oddsLabel(1)).toBe('1 in 1 pack')
    expect(oddsLabel(5)).toBe('1 in ~5 packs')
  })
  it('translates a price into things you can buy at retail', () => {
    expect(asMsrpUnits(3, DEFAULT_UNITS)).toBe('under 1 booster pack')
    expect(asMsrpUnits(13.5, DEFAULT_UNITS)).toBe('3 booster packs')
    expect(asMsrpUnits(140.11, DEFAULT_UNITS)).toBe('31 booster packs · 2.8 ETBs')
    expect(asMsrpUnits(2265, DEFAULT_UNITS)).toBe('14 booster boxes · 45 ETBs')
    expect(asMsrpUnits(161.64, DEFAULT_UNITS)).toBe('1 booster box · 3.2 ETBs')
  })
  it('translates a pack count into boxes and ETBs', () => {
    expect(packsAsProducts(480, DEFAULT_UNITS)).toBe('13 booster boxes or 53 ETBs')
    expect(packsAsProducts(36, DEFAULT_UNITS)).toBe('1 booster box or 4 ETBs')
    expect(packsAsProducts(18, DEFAULT_UNITS)).toBe('2 ETBs')
    expect(packsAsProducts(5, DEFAULT_UNITS)).toBe('under one ETB')
  })
  it('words a set value as booster boxes', () => {
    expect(boxesLabel(549.38, DEFAULT_UNITS)).toBe('3.4 booster boxes')
    expect(boxesLabel(80, DEFAULT_UNITS)).toBe('half a booster box')
    expect(boxesLabel(10, DEFAULT_UNITS)).toBe('under a tenth of a booster box')
  })
  it('measures how top-heavy a set is', () => {
    expect(shareOfValue([100, 50, 30, 20], 1)).toBe(0.5)
    expect(shareOfValue([100, 50, 30, 20], 2)).toBe(0.75)
    expect(shareOfValue([], 3)).toBe(0)
    expect(shareOfValue([0, 0], 1)).toBe(0)
  })
})

describe('retail units from the MSRP seed', () => {
  it('reads pack, ETB and box prices and pack counts', () => {
    const u = unitsFromSeed({
      byType: { pack: { msrp: 4.99, packs: 1 }, etb: { msrp: 54.99, packs: 9 }, 'booster-box': { msrp: 179.64, packs: 36 } },
    })
    expect(u).toEqual({ pack: 4.99, etb: 54.99, box: 179.64, packsPerBox: 36, packsPerEtb: 9 })
  })
  it('falls back to the defaults', () => {
    expect(unitsFromSeed(undefined)).toEqual(DEFAULT_UNITS)
    expect(unitsFromSeed({ byType: {} })).toEqual(DEFAULT_UNITS)
  })
})
