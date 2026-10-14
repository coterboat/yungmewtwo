// Grading math: is sending a raw card to be graded worth it, versus selling it raw? Service fees
// and turnarounds are a dated snapshot (they move often): check the grader's site before sending.
import { netProceeds, type Platform } from './fees.ts'

/** When the preset numbers below were last checked. */
export const GRADING_FACTS_AS_OF = 'mid-2026'

export interface GradingService {
  id: 'psa-regular' | 'psa-value' | 'cgc-economy' | 'bgs-base' | 'tag' | 'custom'
  label: string
  /** Per-card service fee. */
  fee: number
  /** Typical wait in calendar days, if the grader says. */
  days: number | null
  wait: string
  /** Yearly membership some services require. */
  membership: number
  note: string
  /** Set when the tier can't be ordered right now. */
  unavailable?: string
}

export const GRADING_SERVICES: GradingService[] = [
  {
    id: 'psa-regular',
    label: 'PSA Regular',
    fee: 79.99,
    days: 63,
    wait: '40–50 business days',
    membership: 99,
    note: 'Needs a Collectors Club membership (about $99 a year) to submit.',
  },
  {
    id: 'cgc-economy',
    label: 'CGC Economy',
    fee: 20,
    days: 65,
    wait: '~65 days (bulk tier ~120 days)',
    membership: 0,
    note: 'Cheapest slab per card. CGC slabs usually sell for less than PSA ones, so lower the graded prices you enter.',
  },
  {
    id: 'bgs-base',
    label: 'BGS Base',
    fee: 14.95,
    days: null,
    wait: 'varies; check Beckett',
    membership: 0,
    note: 'Beckett base tier. Turnaround moves a lot, so confirm it before you count on it.',
  },
  {
    id: 'psa-value',
    label: 'PSA Value (bulk)',
    fee: 0,
    days: null,
    wait: 'paused',
    membership: 99,
    note: 'PSA paused its bulk Value tiers.',
    unavailable: 'Bulk tiers paused since 2026-06-02',
  },
  {
    id: 'tag',
    label: 'TAG',
    fee: 0,
    days: null,
    wait: 'at capacity',
    membership: 0,
    note: 'TAG is not taking new submissions right now.',
    unavailable: 'At capacity',
  },
  {
    id: 'custom',
    label: 'Custom',
    fee: 30,
    days: null,
    wait: 'you set it',
    membership: 0,
    note: 'Enter any grader or tier yourself.',
  },
]

export const serviceById = (id: string): GradingService => GRADING_SERVICES.find((s) => s.id === id) ?? GRADING_SERVICES[0]

export interface GradeInputs {
  /** What the card sells for raw (market). */
  raw: number
  /** Expected sale prices once slabbed: PSA 10, PSA 9, and the "8 or lower" bucket. */
  price10: number
  price9: number
  price8: number
  /** Chance of each grade, 0..1. The "8 or lower" chance is whatever is left. */
  p10: number
  p9: number
  /** Per-card grading fee. */
  fee: number
  /** Shipping to the grader and back, for the whole submission. */
  shipOut: number
  shipBack: number
  /** Yearly membership the service requires (0 if you already have it). */
  membership: number
  /** Cards in the same submission; shipping and membership are split across them. */
  batch: number
  /** Where the card gets sold, raw or slabbed. */
  platform: Platform
}

export interface GradeLine {
  label: string
  p: number
  price: number
  net: number
}

export type GradeVerdict = 'worth' | 'marginal' | 'raw'

export interface GradeResult {
  p10: number
  p9: number
  p8: number
  /** Grading fee plus this card's share of shipping and membership. */
  allIn: number
  expectedGross: number
  /** Expected sale proceeds after selling fees, before the grading cost. */
  expectedNet: number
  rawNet: number
  /** expectedNet - allIn - rawNet: what grading adds (or costs) on average. */
  advantage: number
  verdict: GradeVerdict
  /** The PSA 10 price at which grading and selling raw come out even; null if a 10 isn't expected. */
  breakEven10: number | null
  byGrade: GradeLine[]
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0))

/** Grading needs a cushion over selling raw: it adds risk and a wait. */
export function gradeVerdict(advantage: number, rawNet: number): GradeVerdict {
  if (advantage > Math.max(10, rawNet * 0.2)) return 'worth'
  if (advantage > 0) return 'marginal'
  return 'raw'
}

export function evaluateGrading(i: GradeInputs): GradeResult {
  const p10 = clamp01(i.p10)
  const p9 = Math.min(clamp01(i.p9), 1 - p10)
  const p8 = Math.max(0, 1 - p10 - p9)
  const batch = Math.max(1, Math.round(i.batch) || 1)
  const allIn = i.fee + (i.shipOut + i.shipBack + i.membership) / batch
  const n10 = netProceeds(i.price10, i.platform)
  const n9 = netProceeds(i.price9, i.platform)
  const n8 = netProceeds(i.price8, i.platform)
  const expectedNet = p10 * n10 + p9 * n9 + p8 * n8
  const expectedGross = p10 * i.price10 + p9 * i.price9 + p8 * i.price8
  const rawNet = netProceeds(i.raw, i.platform)
  const advantage = expectedNet - allIn - rawNet

  let breakEven10: number | null = null
  if (p10 > 0) {
    const needNet = (rawNet + allIn - p9 * n9 - p8 * n8) / p10
    breakEven10 = needNet <= 0 ? 0 : (needNet + i.platform.fixed + i.platform.ship) / (1 - i.platform.rate)
  }

  return {
    p10,
    p9,
    p8,
    allIn,
    expectedGross,
    expectedNet,
    rawNet,
    advantage,
    verdict: gradeVerdict(advantage, rawNet),
    breakEven10,
    byGrade: [
      { label: 'PSA 10', p: p10, price: i.price10, net: n10 },
      { label: 'PSA 9', p: p9, price: i.price9, net: n9 },
      { label: '8 or lower', p: p8, price: i.price8, net: n8 },
    ],
  }
}

/** How the break-even PSA 10 price shrinks as more cards share one submission. */
export function breakEvenByBatch(i: GradeInputs, sizes: number[]): Array<{ batch: number; breakEven10: number | null; allIn: number }> {
  return sizes.map((batch) => {
    const r = evaluateGrading({ ...i, batch })
    return { batch, breakEven10: r.breakEven10, allIn: r.allIn }
  })
}

/** eBay's "sold items" search for a phrase: the quickest way to see what a graded copy really sells for. */
export function ebaySoldUrl(query: string): string {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`
}

/** "Umbreon ex - 161/131" -> "Umbreon ex 161/131 PSA 10". */
export function gradeQuery(name: string, grade: number): string {
  return `${name.replace(/\s+-\s+(\S+)$/, ' $1')} PSA ${grade}`
}
