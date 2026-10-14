import { describe, expect, it } from 'vitest'
import { chaseTiers, histogram, mulberry32, percentile, simulate, type SimTier } from './evSim.ts'

const tiers: SimTier[] = [
  { rarity: 'Double Rare', p: 0.2, values: [1, 3] },
  { rarity: 'Special Illustration Rare', p: 1 / 100, values: [50, 150, 400] },
  { rarity: 'Mega Hyper Rare', p: 1 / 1000, values: [250] },
]

describe('mulberry32', () => {
  it('is deterministic and uniform-ish', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    const xs = Array.from({ length: 1000 }, () => a())
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()))
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...xs)).toBeLessThan(1)
    expect(xs.reduce((s, x) => s + x, 0) / xs.length).toBeCloseTo(0.5, 1)
  })
})

describe('percentile', () => {
  it('interpolates sorted values', () => {
    const s = Float64Array.from([10, 20, 30, 40, 50])
    expect(percentile(s, 0)).toBe(10)
    expect(percentile(s, 0.5)).toBe(30)
    expect(percentile(s, 1)).toBe(50)
    expect(percentile(s, 0.25)).toBe(20)
    expect(percentile(s, 0.9)).toBeCloseTo(46, 9)
  })
})

describe('simulate', () => {
  const packs = 36
  const runs = 5000
  const sim = simulate({ tiers, packs, bulkPerPack: 0.25, runs, seed: 1 })
  const analytic = tiers.reduce((s, t) => s + t.p * (t.values.reduce((a, b) => a + b, 0) / t.values.length), 0) * packs + 0.25 * packs

  it('is repeatable for a seed', () => {
    const again = simulate({ tiers, packs, bulkPerPack: 0.25, runs, seed: 1 })
    expect(again.median).toBe(sim.median)
    expect(again.mean).toBe(sim.mean)
  })
  it('averages out to the analytic EV', () => {
    expect(sim.mean / analytic).toBeGreaterThan(0.93)
    expect(sim.mean / analytic).toBeLessThan(1.07)
  })
  it('has a median below the mean when value sits in rare hits', () => {
    expect(sim.median).toBeLessThan(sim.mean)
    expect(sim.p10).toBeLessThanOrEqual(sim.median)
    expect(sim.p90).toBeGreaterThanOrEqual(sim.median)
    expect(sim.p10).toBeGreaterThan(0)
  })
  it('sorts the outcomes and reports the run count', () => {
    expect(sim.values).toHaveLength(runs)
    for (let i = 1; i < sim.values.length; i++) expect(sim.values[i]).toBeGreaterThanOrEqual(sim.values[i - 1])
  })
  it('matches the analytic chance of at least one hit', () => {
    for (const t of tiers) {
      const got = sim.atLeastOne[t.rarity]
      const want = 1 - (1 - t.p) ** packs
      expect(Math.abs(got - want)).toBeLessThan(0.03)
    }
  })
  it('gives a share of runs above a price', () => {
    expect(sim.probAbove(0)).toBe(1)
    expect(sim.probAbove(1e9)).toBe(0)
    expect(sim.probAbove(sim.median)).toBeCloseTo(0.5, 1)
  })
  it('collapses to the bulk allowance when there are no tiers', () => {
    const flat = simulate({ tiers: [], packs: 10, bulkPerPack: 0.3, runs: 100, seed: 2 })
    expect(flat.median).toBeCloseTo(3, 9)
    expect(flat.p10).toBeCloseTo(3, 9)
  })
  it('handles a guaranteed tier (1 in 1)', () => {
    const s = simulate({ tiers: [{ rarity: 'Pikachu Rare', p: 1, values: [2] }], packs: 5, bulkPerPack: 0, runs: 50, seed: 3 })
    expect(s.median).toBe(10)
    expect(s.atLeastOne['Pikachu Rare']).toBe(1)
  })
  it('scales to a case (432 packs) quickly', () => {
    const t0 = Date.now()
    const big = simulate({ tiers, packs: 432, bulkPerPack: 0.25, runs: 5000, seed: 4 })
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(big.mean).toBeGreaterThan(sim.mean)
  })
})

describe('histogram', () => {
  it('bins sorted values and folds outliers into the last bin', () => {
    const s = Float64Array.from([1, 2, 2, 3, 3, 3, 4, 100])
    const h = histogram(s, 4, 0, 4)
    expect(h.bins).toHaveLength(4)
    expect(h.bins.reduce((a, b) => a + b.count, 0)).toBe(8)
    expect(h.bins.map((b) => b.count)).toEqual([0, 1, 2, 5]) // 3, 3, 3, 4 and the 100 outlier land in the last bin
    expect(h.bins[0].lo).toBe(0)
    expect(h.bins[3].hi).toBe(4)
  })
})

describe('chaseTiers', () => {
  it('picks SIR and the rarest tier', () => {
    expect(chaseTiers(['Double Rare', 'Illustration Rare', 'Special Illustration Rare', 'Mega Hyper Rare'], { 'Double Rare': 5, 'Illustration Rare': 9, 'Special Illustration Rare': 100, 'Mega Hyper Rare': 1000 })).toEqual(['Special Illustration Rare', 'Mega Hyper Rare'])
  })
  it('returns the single tier when SIR is also the rarest', () => {
    expect(chaseTiers(['Double Rare', 'Special Illustration Rare'], { 'Double Rare': 5, 'Special Illustration Rare': 100 })).toEqual(['Special Illustration Rare'])
  })
  it('falls back to the rarest tier when there is no SIR', () => {
    expect(chaseTiers(['Rare Holo', 'Rare Secret'], { 'Rare Holo': 3, 'Rare Secret': 200 })).toEqual(['Rare Secret'])
  })
})
