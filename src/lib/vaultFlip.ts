// "Flip to fund": which of your cards to sell to pay for the one you actually want. Ranks what you
// hold, then walks down the list until the net proceeds (after estimated fees) cover the target.
// Market price is not a guaranteed sale price, and fees are estimates (see fees.ts).
import { netProceeds, type Platform } from './fees.ts'

export interface SellCandidate {
  itemId: string
  productId: number
  name: string
  /** Copies you hold in this lot. */
  qty: number
  /** Market price per copy. */
  market: number
  /** What you paid per copy; null = not recorded (treated as a free pull when ranking). */
  cost: number | null
  /** Flagged for trade: already something you're willing to move. */
  trade: boolean
}

const gainOf = (c: SellCandidate) => c.market - (c.cost ?? 0)

/** Sell order: trade-flagged first, then biggest gain vs cost. Skips anything priced at zero and anything you also want. */
export function rankCandidates(cands: SellCandidate[], wantedProductIds: ReadonlySet<number>): SellCandidate[] {
  return cands
    .filter((c) => c.market > 0 && c.qty > 0 && !wantedProductIds.has(c.productId))
    .sort((a, b) => Number(b.trade) - Number(a.trade) || gainOf(b) - gainOf(a) || b.market - a.market || a.name.localeCompare(b.name))
}

export interface FundPick {
  cand: SellCandidate
  /** Copies to sell from the lot. */
  units: number
  unitNet: number
  /** Net for these copies. */
  net: number
  /** Total net after this pick. */
  running: number
}

export interface FundPlan {
  platform: Platform
  target: number
  picks: FundPick[]
  /** Net proceeds from every pick, after estimated fees. */
  net: number
  /** Market value of what's being sold, before fees. */
  gross: number
  covered: boolean
  /** How far short the plan is (0 when covered). */
  short: number
  /** Total copies to sell. */
  units: number
}

const EPS = 0.005

/**
 * Walks `ranked` (best first) selling until `target` is covered. Each copy is counted as its own
 * sale, so fees are on the high side if you'd bundle cards into one order. The last step picks the
 * card that closes the gap with the least overshoot among the same kind (trade-flagged or not), so
 * a $20 gap doesn't send a $400 card out the door.
 */
export function planFund(ranked: SellCandidate[], target: number, platform: Platform): FundPlan {
  const pool = ranked.map((cand) => ({ cand, unitNet: netProceeds(cand.market, platform) })).filter((x) => x.unitNet > 0)
  const picks: FundPick[] = []
  const used = new Set<string>()
  let running = 0
  let gross = 0
  let units = 0

  while (running < target - EPS) {
    const remaining = target - running
    const next = pool.find((x) => !used.has(x.cand.itemId))
    if (!next) break
    const unitsToCover = (x: (typeof pool)[number]) => Math.ceil(remaining / x.unitNet - 1e-9)
    let chosen = next
    let take = next.cand.qty
    if (unitsToCover(next) <= next.cand.qty) {
      let bestOver = Infinity
      for (const x of pool) {
        if (used.has(x.cand.itemId) || x.cand.trade !== next.cand.trade) continue
        const n = unitsToCover(x)
        if (n > x.cand.qty) continue
        const over = n * x.unitNet - remaining
        if (over < bestOver - 1e-9) {
          bestOver = over
          chosen = x
          take = n
        }
      }
    }
    used.add(chosen.cand.itemId)
    const net = take * chosen.unitNet
    running += net
    gross += take * chosen.cand.market
    units += take
    picks.push({ cand: chosen.cand, units: take, unitNet: chosen.unitNet, net, running })
  }

  const covered = running >= target - EPS
  return { platform, target, picks, net: running, gross, covered, short: covered ? 0 : target - running, units }
}
