import { describe, expect, it } from 'vitest'
import { expectOneText, ofHundred, outOf100Text, sealedUnit } from './evOdds.ts'

describe('sealedUnit', () => {
  it('names common sealed types', () => {
    expect(sealedUnit('booster-box')).toEqual({ one: 'booster box', many: 'booster boxes' })
    expect(sealedUnit('etb')).toEqual({ one: 'ETB', many: 'ETBs' })
    expect(sealedUnit('bundle')).toEqual({ one: 'booster bundle', many: 'booster bundles' })
    expect(sealedUnit('pack')).toEqual({ one: 'pack', many: 'packs' })
  })
  it('falls back to a generic name', () => {
    expect(sealedUnit(undefined)).toEqual({ one: 'product', many: 'products' })
    expect(sealedUnit('upc')).toEqual({ one: 'product', many: 'products' })
  })
})

describe('expectOneText', () => {
  const box = sealedUnit('booster-box')
  it('turns 1 in N packs into boxes to expect one', () => {
    expect(expectOneText(80, 36, box)).toBe('about 2.2 booster boxes to expect one')
    expect(expectOneText(1260, 36, box)).toBe('about 35 booster boxes to expect one')
  })
  it('says per box when the odds are better than one a box', () => {
    expect(expectOneText(9, 36, box)).toBe('about 4 per booster box')
    expect(expectOneText(12, 36, box)).toBe('about 3 per booster box')
  })
  it('handles about one', () => {
    expect(expectOneText(36, 36, box)).toBe('about 1 booster box to expect one')
  })
  it('works for a single pack', () => {
    expect(expectOneText(80, 1, sealedUnit('pack'))).toBe('about 80 packs to expect one')
  })
  it('is empty without a pack count', () => {
    expect(expectOneText(80, 0, box)).toBe('')
  })
})

describe('ofHundred', () => {
  it('rounds a share to a count out of 100', () => {
    expect(ofHundred(0.614)).toBe(61)
    expect(ofHundred(0)).toBe(0)
    expect(ofHundred(1)).toBe(100)
    expect(ofHundred(1.4)).toBe(100)
  })
})

describe('outOf100Text', () => {
  it('phrases the chance of losing money', () => {
    expect(outOf100Text(0.39, sealedUnit('booster-box'))).toBe('Out of 100 booster boxes like this, 61 lose money')
    expect(outOf100Text(0.14, sealedUnit('bundle'))).toBe('Out of 100 booster bundles like this, 86 lose money')
  })
  it('handles the extremes', () => {
    expect(outOf100Text(1, sealedUnit('etb'))).toBe('Out of 100 ETBs like this, none lose money')
    expect(outOf100Text(0.001, sealedUnit('etb'))).toBe('Out of 100 ETBs like this, all lose money')
  })
})
