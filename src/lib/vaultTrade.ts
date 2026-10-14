// Trade matches between the two vaults: what your cousin has that you want, what you have that
// they want, and the cards you both want (so you don't bid against each other).
import type { VaultItem } from './user.ts'
import { isHeld } from './vault.ts'

export interface TradeMatch {
  productId: number
  variant?: string
  /** Your item. */
  mine: VaultItem
  /** Their item. */
  theirs: VaultItem
  /** The holder has it flagged for trade (rather than just owning it). */
  tradeFlag: boolean
}

export interface TradeMatches {
  /** They have (or are trading) a card on your want list. */
  theyHave: TradeMatch[]
  /** You have (or are trading) a card on their want list. */
  iHave: TradeMatch[]
  /** On both want lists. */
  bothWant: TradeMatch[]
}

const compatible = (a?: string, b?: string) => !a || !b || a === b

/** The holder's best lot for a wanted card: trade-flagged first, then the bigger stack. */
function bestHolder(wanted: VaultItem, holders: VaultItem[]): VaultItem | undefined {
  return holders
    .filter((h) => h.productId === wanted.productId && compatible(h.variant, wanted.variant))
    .sort((a, b) => Number(b.status === 'trade') - Number(a.status === 'trade') || b.qty - a.qty)[0]
}

const byFlag = (a: TradeMatch, b: TradeMatch) => Number(b.tradeFlag) - Number(a.tradeFlag)

export function tradeMatches(mine: VaultItem[], theirs: VaultItem[]): TradeMatches {
  const myWants = mine.filter((i) => i.status === 'want')
  const theirWants = theirs.filter((i) => i.status === 'want')
  const myHeld = mine.filter(isHeld)
  const theirHeld = theirs.filter(isHeld)

  const theyHave: TradeMatch[] = []
  for (const want of myWants) {
    const h = bestHolder(want, theirHeld)
    if (h) theyHave.push({ productId: want.productId, variant: want.variant ?? h.variant, mine: want, theirs: h, tradeFlag: h.status === 'trade' })
  }

  const iHave: TradeMatch[] = []
  for (const want of theirWants) {
    const h = bestHolder(want, myHeld)
    if (h) iHave.push({ productId: want.productId, variant: want.variant ?? h.variant, mine: h, theirs: want, tradeFlag: h.status === 'trade' })
  }

  const bothWant: TradeMatch[] = []
  for (const want of myWants) {
    const other = theirWants.find((w) => w.productId === want.productId && compatible(w.variant, want.variant))
    if (other) bothWant.push({ productId: want.productId, variant: want.variant ?? other.variant, mine: want, theirs: other, tradeFlag: false })
  }

  return { theyHave: theyHave.sort(byFlag), iHave: iHave.sort(byFlag), bothWant }
}
