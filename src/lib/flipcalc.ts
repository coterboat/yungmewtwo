// Flip math: what a sale nets after fees, profit, ROI and the break-even sell price. Fee numbers
// come from fees.ts (estimates), so everything here is an estimate too.
import { PLATFORMS, netProceeds, type Platform } from './fees.ts'

export interface FlipInput {
  buy: number
  sell: number
  platform: Platform
  qty?: number
}

export interface FlipResult {
  platform: Platform
  /** What you keep per item after fees and shipping. */
  net: number
  fees: number
  profit: number
  /** profit / buy, or null when buy is 0 (a free pull). */
  roi: number | null
  breakEven: number
  /** Totals for `qty` items. */
  totalProfit: number
}

/** Same platform with the shipping cost replaced; null leaves it alone. */
export function withShipping(p: Platform, ship: number | null): Platform {
  return ship == null ? p : { ...p, ship: Math.max(0, ship) }
}

/** The sell price at which a sale on `platform` just returns `buy`. */
export function breakEvenSell(buy: number, p: Platform): number {
  return (buy + p.fixed + p.ship) / (1 - p.rate)
}

/** The sell price that nets buy x (1 + roi). */
export function sellPriceForRoi(buy: number, roi: number, p: Platform): number {
  return breakEvenSell(buy * (1 + roi), p)
}

export function flipResult({ buy, sell, platform, qty = 1 }: FlipInput): FlipResult {
  const net = netProceeds(sell, platform)
  const profit = net - buy
  return {
    platform,
    net,
    fees: sell - net,
    profit,
    roi: buy > 0 ? profit / buy : null,
    breakEven: breakEvenSell(buy, platform),
    totalProfit: profit * qty,
  }
}

export interface PlatformRow extends FlipResult {
  best: boolean
  /** The sell price this row used (local sales can be discounted). */
  soldAt: number
}

/**
 * The flip across every platform; `best` marks the highest profit. `localDiscount` lowers the
 * sell price for local / cash deals (people haggle), e.g. 0.1 for 10% under.
 */
export function allPlatforms({ buy, sell, qty = 1, ship = null, localDiscount = 0 }: { buy: number; sell: number; qty?: number; ship?: number | null; localDiscount?: number }): PlatformRow[] {
  const rows = PLATFORMS.map((p) => {
    const local = p.id === 'local'
    const soldAt = local ? sell * (1 - localDiscount) : sell
    return { ...flipResult({ buy, sell: soldAt, platform: local ? p : withShipping(p, ship), qty }), soldAt }
  })
  const top = Math.max(...rows.map((r) => r.profit))
  let marked = false
  return rows.map((r) => {
    const best = !marked && r.profit === top
    if (best) marked = true
    return { ...r, best }
  })
}
