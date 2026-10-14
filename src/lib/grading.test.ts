import { describe, expect, it } from 'vitest'
import { PLATFORMS, netProceeds } from './fees.ts'
import { GRADING_SERVICES, breakEvenByBatch, ebaySoldUrl, evaluateGrading, gradeQuery, type GradeInputs } from './grading.ts'

const tcg = PLATFORMS[0]

const base: GradeInputs = {
  raw: 100,
  price10: 300,
  price9: 130,
  price8: 70,
  p10: 0.25,
  p9: 0.5,
  fee: 79.99,
  shipOut: 12,
  shipBack: 15,
  membership: 0,
  batch: 1,
  platform: tcg,
}

describe('grading service presets', () => {
  it('carries the dated mid-2026 facts', () => {
    const by = Object.fromEntries(GRADING_SERVICES.map((s) => [s.id, s]))
    expect(by['psa-regular'].fee).toBe(79.99)
    expect(by['psa-regular'].membership).toBe(99)
    expect(by['cgc-economy'].fee).toBe(20)
    expect(by['bgs-base'].fee).toBe(14.95)
    expect(by['psa-value'].unavailable).toMatch(/2026-06-02/)
    expect(by['tag'].unavailable).toMatch(/capacity/i)
  })
})

describe('grading evaluation', () => {
  it('splits the remainder into the 8-or-lower bucket', () => {
    const r = evaluateGrading(base)
    expect(r.p8).toBeCloseTo(0.25, 9)
    expect(r.byGrade.map((g) => g.p).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
  })
  it('clamps probabilities that add past 100%', () => {
    const r = evaluateGrading({ ...base, p10: 0.7, p9: 0.6 })
    expect(r.p9).toBeCloseTo(0.3, 9)
    expect(r.p8).toBe(0)
  })
  it('computes expected net after selling fees and the all-in grading cost', () => {
    const r = evaluateGrading(base)
    const expected = 0.25 * netProceeds(300, tcg) + 0.5 * netProceeds(130, tcg) + 0.25 * netProceeds(70, tcg)
    expect(r.expectedNet).toBeCloseTo(expected, 6)
    expect(r.allIn).toBeCloseTo(79.99 + 27, 6)
    expect(r.rawNet).toBeCloseTo(netProceeds(100, tcg), 6)
    expect(r.advantage).toBeCloseTo(expected - (79.99 + 27) - netProceeds(100, tcg), 6)
  })
  it('splits shipping and membership across the batch', () => {
    const solo = evaluateGrading({ ...base, membership: 99 })
    const ten = evaluateGrading({ ...base, membership: 99, batch: 10 })
    expect(solo.allIn).toBeCloseTo(79.99 + 27 + 99, 6)
    expect(ten.allIn).toBeCloseTo(79.99 + 2.7 + 9.9, 6)
  })
  it('says sell raw when a cheap card cannot cover the fee', () => {
    const r = evaluateGrading({ ...base, raw: 15, price10: 60, price9: 25, price8: 12 })
    expect(r.verdict).toBe('raw')
  })
  it('says worth grading with a clear cushion', () => {
    const r = evaluateGrading({ ...base, raw: 40, price10: 600, price9: 150, price8: 40, p10: 0.4, p9: 0.4, fee: 20, shipOut: 3, shipBack: 5 })
    expect(r.verdict).toBe('worth')
    expect(r.advantage).toBeGreaterThan(10)
  })
  it('calls a thin edge marginal', () => {
    const r = evaluateGrading(base)
    const thin = evaluateGrading({ ...base, price10: 300 + (10 - r.advantage + 1) / (0.25 * (1 - tcg.rate)) })
    expect(thin.advantage).toBeGreaterThan(0)
    expect(thin.verdict).toBe('marginal')
  })
})

describe('break-even PSA 10', () => {
  it('lands exactly on zero advantage', () => {
    const r = evaluateGrading(base)
    expect(r.breakEven10).not.toBeNull()
    const at = evaluateGrading({ ...base, price10: r.breakEven10 as number })
    expect(at.advantage).toBeCloseTo(0, 4)
  })
  it('is null when a 10 is not expected at all', () => {
    expect(evaluateGrading({ ...base, p10: 0 }).breakEven10).toBeNull()
  })
  it('falls as the batch grows', () => {
    const rows = breakEvenByBatch(base, [1, 5, 10])
    expect(rows[0].breakEven10).toBeGreaterThan(rows[1].breakEven10 as number)
    expect(rows[1].breakEven10).toBeGreaterThan(rows[2].breakEven10 as number)
  })
})

describe('eBay sold search', () => {
  it('builds a completed-listings URL', () => {
    const url = ebaySoldUrl('Umbreon ex 161/131 PSA 10')
    expect(url).toContain('ebay.com/sch/i.html')
    expect(url).toContain('LH_Sold=1')
    expect(url).toContain('LH_Complete=1')
    expect(url).toContain('Umbreon%20ex%20161%2F131%20PSA%2010')
  })
  it('turns a catalog name into a search phrase', () => {
    expect(gradeQuery('Umbreon ex - 161/131', 10)).toBe('Umbreon ex 161/131 PSA 10')
    expect(gradeQuery('Charizard', 9)).toBe('Charizard PSA 9')
  })
})
