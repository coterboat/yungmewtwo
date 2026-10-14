// Scores a price against market value and MSRP. Used by the Board (posted deals), Tools (deal
// checker) and Radar. Market prices are TCGplayer market (recent sales), not asking prices.
import { netProceeds, PLATFORMS } from './fees.ts'

export type Verdict = 'steal' | 'great' | 'good' | 'fair' | 'over' | 'unknown'

export interface DealScore {
  verdict: Verdict
  /** price / market − 1 (−0.2 = 20% under market). */
  vsMarket: number | null
  /** price / msrp − 1. */
  vsMsrp: number | null
  perPack: number | null
  /** Profit if bought at `price` and sold at market on TCGplayer, after fees. */
  flip: number | null
  label: string
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  steal: 'Steal',
  great: 'Great deal',
  good: 'Good',
  fair: 'Fair',
  over: 'Over market',
  unknown: 'No market data',
}

export function scoreDeal({ price, market, msrp, packs }: { price: number; market?: number | null; msrp?: number | null; packs?: number | null }): DealScore {
  const vsMarket = market ? price / market - 1 : null
  const vsMsrp = msrp ? price / msrp - 1 : null
  const perPack = packs ? price / packs : null
  const flip = market ? Math.round((netProceeds(market, PLATFORMS[0]) - price) * 100) / 100 : null
  let verdict: Verdict = 'unknown'
  if (vsMarket != null) verdict = vsMarket <= -0.25 ? 'steal' : vsMarket <= -0.1 ? 'great' : vsMarket <= 0.02 ? 'good' : vsMarket <= 0.12 ? 'fair' : 'over'
  else if (vsMsrp != null) verdict = vsMsrp <= 0.001 ? 'good' : vsMsrp <= 0.1 ? 'fair' : 'over'
  // Paying MSRP for something that trades well above it is always a win.
  if (vsMsrp != null && vsMsrp <= 0.001 && vsMarket != null && vsMarket <= -0.2) verdict = 'steal'
  return { verdict, vsMarket, vsMsrp, perPack, flip, label: VERDICT_LABEL[verdict] }
}

export function verdictTone(v: Verdict): 'holo' | 'good' | 'accent' | 'neutral' | 'critical' {
  return v === 'steal' ? 'holo' : v === 'great' || v === 'good' ? 'good' : v === 'fair' ? 'neutral' : v === 'over' ? 'critical' : 'neutral'
}
