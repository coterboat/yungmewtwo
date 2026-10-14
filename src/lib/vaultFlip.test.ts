import { describe, expect, it } from 'vitest'
import { PLATFORMS, netProceeds } from './fees.ts'
import { planFund, rankCandidates, type SellCandidate } from './vaultFlip.ts'

const tcg = PLATFORMS[0]
const local = PLATFORMS[2]

const c = (id: string, productId: number, market: number, over: Partial<SellCandidate> = {}): SellCandidate => ({
  itemId: id,
  productId,
  name: `Card ${id}`,
  qty: 1,
  market,
  cost: null,
  trade: false,
  ...over,
})

describe('rankCandidates', () => {
  it('puts trade-flagged items first, then biggest gain vs cost', () => {
    const ranked = rankCandidates(
      [
        c('small-gain', 1, 60, { cost: 50 }), // gain 10
        c('big-gain', 2, 100, { cost: 20 }), // gain 80
        c('flagged', 3, 30, { cost: 40, trade: true }), // gain -10 but flagged
        c('pull', 4, 50), // no cost: counts as a free pull, gain 50
      ],
      new Set(),
    )
    expect(ranked.map((x) => x.itemId)).toEqual(['flagged', 'big-gain', 'pull', 'small-gain'])
  })
  it('skips items whose product is also on the want list, and unpriced ones', () => {
    const ranked = rankCandidates([c('a', 1, 100), c('b', 2, 80), c('z', 3, 0)], new Set([1]))
    expect(ranked.map((x) => x.itemId)).toEqual(['b'])
  })
})

describe('planFund', () => {
  it('sells down the ranking until the target is covered, with a running net', () => {
    const ranked = rankCandidates([c('a', 1, 100, { cost: 10 }), c('b', 2, 80, { cost: 10 }), c('c', 3, 60, { cost: 10 })], new Set())
    const plan = planFund(ranked, 150, tcg)
    expect(plan.covered).toBe(true)
    expect(plan.picks.map((p) => p.cand.itemId)).toEqual(['a', 'b'])
    expect(plan.net).toBeCloseTo(netProceeds(100, tcg) + netProceeds(80, tcg), 6)
    expect(plan.picks[0].running).toBeCloseTo(netProceeds(100, tcg), 6)
    expect(plan.picks[1].running).toBeCloseTo(plan.net, 6)
    expect(plan.short).toBe(0)
  })
  it('takes only as many copies as it needs from a stack', () => {
    const plan = planFund([c('stack', 1, 30, { qty: 10 })], 100, local)
    expect(plan.picks).toHaveLength(1)
    expect(plan.picks[0].units).toBe(4)
    expect(plan.net).toBe(120)
  })
  it('finishes with the tightest fit instead of the biggest card', () => {
    const ranked = rankCandidates([c('huge', 1, 400, { cost: 10 }), c('fit', 2, 30, { cost: 10 }), c('tiny', 3, 5, { cost: 1 })], new Set())
    const plan = planFund(ranked, 25, local)
    expect(plan.picks.map((p) => p.cand.itemId)).toEqual(['fit'])
  })
  it('still sells trade-flagged cards first even when they overshoot', () => {
    const ranked = rankCandidates([c('flag', 1, 300, { trade: true }), c('fit', 2, 30, { cost: 10 })], new Set())
    const plan = planFund(ranked, 25, local)
    expect(plan.picks.map((p) => p.cand.itemId)).toEqual(['flag'])
  })
  it('finishes with the cheapest card that closes the gap', () => {
    const ranked = rankCandidates([c('a', 1, 60, { cost: 1 }), c('b', 2, 50, { cost: 1 }), c('c', 3, 40, { cost: 1 })], new Set())
    // a alone is 60; target 100 needs a + b (110) or a + c (100); tightest finisher is c.
    const plan = planFund(ranked, 100, local)
    expect(plan.picks.map((p) => p.cand.itemId)).toEqual(['a', 'c'])
    expect(plan.net).toBe(100)
  })
  it('reports the shortfall when everything eligible is not enough', () => {
    const plan = planFund(rankCandidates([c('a', 1, 20), c('b', 2, 15)], new Set()), 500, local)
    expect(plan.covered).toBe(false)
    expect(plan.picks).toHaveLength(2)
    expect(plan.short).toBeCloseTo(465, 6)
  })
  it('ignores cards that net nothing after fees', () => {
    const plan = planFund(rankCandidates([c('dime', 1, 1.5)], new Set()), 5, tcg)
    expect(plan.picks).toHaveLength(0)
    expect(plan.covered).toBe(false)
  })
  it('is trivially covered for a zero target', () => {
    const plan = planFund([c('a', 1, 10)], 0, tcg)
    expect(plan.covered).toBe(true)
    expect(plan.picks).toHaveLength(0)
  })
  it('nets less on eBay than locally for the same cards', () => {
    const ranked = rankCandidates([c('a', 1, 100)], new Set())
    expect(planFund(ranked, 50, PLATFORMS[1]).net).toBeLessThan(planFund(ranked, 50, local).net)
  })
})
