import { describe, expect, it } from 'vitest'
import { PLATFORMS, netProceeds } from './fees.ts'
import { allPlatforms, breakEvenSell, flipResult, sellPriceForRoi, withShipping } from './flipcalc.ts'

const tcg = PLATFORMS[0]
const local = PLATFORMS[2]

describe('flip calculator', () => {
  it('nets a sale and reports profit and ROI', () => {
    const r = flipResult({ buy: 50, sell: 100, platform: tcg })
    expect(r.net).toBeCloseTo(netProceeds(100, tcg), 6)
    expect(r.profit).toBeCloseTo(r.net - 50, 6)
    expect(r.roi).toBeCloseTo(r.profit / 50, 6)
    expect(r.fees).toBeCloseTo(100 - r.net, 6)
  })
  it('scales totals by quantity', () => {
    const one = flipResult({ buy: 20, sell: 30, platform: tcg })
    const three = flipResult({ buy: 20, sell: 30, platform: tcg, qty: 3 })
    expect(three.totalProfit).toBeCloseTo(one.profit * 3, 6)
    expect(three.roi).toBeCloseTo(one.roi ?? 0, 6)
  })
  it('break-even is where profit hits zero', () => {
    for (const p of PLATFORMS) {
      const be = breakEvenSell(80, p)
      expect(netProceeds(be, p)).toBeCloseTo(80, 6)
    }
    expect(breakEvenSell(80, local)).toBe(80)
  })
  it('sell price for a target ROI nets buy x (1 + roi)', () => {
    const s = sellPriceForRoi(50, 0.2, tcg)
    expect(netProceeds(s, tcg)).toBeCloseTo(60, 6)
  })
  it('handles a free pull (no buy price) without dividing by zero', () => {
    const r = flipResult({ buy: 0, sell: 10, platform: tcg })
    expect(r.roi).toBeNull()
    expect(r.profit).toBeGreaterThan(0)
  })
  it('lets shipping be overridden', () => {
    const cheap = withShipping(tcg, 0)
    expect(netProceeds(10, cheap)).toBeGreaterThan(netProceeds(10, tcg))
    expect(withShipping(tcg, null)).toBe(tcg)
  })
  it('compares every platform and marks exactly one best', () => {
    const rows = allPlatforms({ buy: 50, sell: 100 })
    expect(rows).toHaveLength(PLATFORMS.length)
    expect(rows.filter((r) => r.best)).toHaveLength(1)
    expect(rows.find((r) => r.best)?.platform.id).toBe('local')
  })
  it('can discount local deals', () => {
    const rows = allPlatforms({ buy: 50, sell: 100, localDiscount: 0.1 })
    const local = rows.find((r) => r.platform.id === 'local')
    expect(local?.soldAt).toBeCloseTo(90, 9)
    expect(local?.net).toBeCloseTo(90, 9)
    expect(rows.find((r) => r.platform.id === 'tcgplayer')?.soldAt).toBe(100)
  })
})
