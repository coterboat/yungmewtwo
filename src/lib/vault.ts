// Vault math: what a collection is worth, what it cost, what it made, and how its value moved.
// Pure functions over VaultItem + catalog data; the screens in features/vault do the fetching.
// Money fields on a VaultItem (cost, soldFor) are always per item, not per lot.
import { headline } from './data.ts'
import type { SetHistory, SiteProduct } from './site.ts'
import type { VaultItem } from './user.ts'

export interface Quote {
  /** Variant code the prices are for. */
  variant: string
  market: number | null
  low: number | null
  change1d: number | null
  change7d: number | null
  change30d: number | null
}

/** Current prices for an item: its own variant if the product has it, else the headline variant. */
export function quoteFor(p: SiteProduct | undefined, variant?: string): Quote | undefined {
  if (!p) return undefined
  const own = variant ? p.v[variant] : undefined
  const found: [string, SiteProduct['v'][string]] | undefined = own ? [variant as string, own] : headline(p)
  if (!found) return undefined
  const [code, vp] = found
  return { variant: code, market: vp[0] ?? vp[1], low: vp[1], change1d: vp[2], change7d: vp[3], change30d: vp[4] }
}

export const isHeld = (i: Pick<VaultItem, 'status'>) => i.status === 'have' || i.status === 'trade'
export const heldItems = (items: VaultItem[]) => items.filter(isHeld)

export interface ValuedItem {
  item: VaultItem
  quote?: Quote
  /** Market price per item. */
  market: number | null
  /** market x qty. */
  value: number | null
  /** cost x qty, when a cost is recorded (0 counts: a free pull). */
  costTotal: number | null
  /** value - costTotal. */
  gain: number | null
  /** gain / costTotal; null when the cost is 0 or unknown. */
  gainPct: number | null
}

export function valueItem(item: VaultItem, quote: Quote | undefined): ValuedItem {
  const market = quote?.market ?? null
  const value = market != null ? market * item.qty : null
  const costTotal = item.cost != null ? item.cost * item.qty : null
  const gain = value != null && costTotal != null ? value - costTotal : null
  return { item, quote, market, value, costTotal, gain, gainPct: gain != null && costTotal ? gain / costTotal : null }
}

export interface VaultSummary {
  /** Market value of everything held (have + trade) that has a price. */
  value: number
  heldUnits: number
  /** Held items with no market price (left out of value). */
  unpriced: number
  /** Cost of held items that have a recorded cost. */
  cost: number
  /** Market value of those same items, so P&L compares like with like. */
  costedValue: number
  unrealized: number
  unrealizedPct: number | null
  /** Held items with no recorded cost (left out of P&L). */
  uncosted: number
  /** Profit on sold items that have a recorded cost. */
  realized: number
  /** Everything sold items brought in. */
  soldRevenue: number
  soldUnits: number
}

export function summarize(rows: ValuedItem[]): VaultSummary {
  const s: VaultSummary = { value: 0, heldUnits: 0, unpriced: 0, cost: 0, costedValue: 0, unrealized: 0, unrealizedPct: null, uncosted: 0, realized: 0, soldRevenue: 0, soldUnits: 0 }
  for (const r of rows) {
    const { item } = r
    if (isHeld(item)) {
      s.heldUnits += item.qty
      if (r.value == null) s.unpriced++
      else s.value += r.value
      if (r.costTotal == null) s.uncosted++
      else if (r.value != null) {
        s.cost += r.costTotal
        s.costedValue += r.value
      }
    } else if (item.status === 'sold') {
      s.soldUnits += item.qty
      if (item.soldFor != null) {
        s.soldRevenue += item.soldFor * item.qty
        if (item.cost != null) s.realized += (item.soldFor - item.cost) * item.qty
      }
    }
  }
  s.unrealized = s.costedValue - s.cost
  s.unrealizedPct = s.cost > 0 ? s.unrealized / s.cost : null
  return s
}

/**
 * Marks `qty` of an item as sold at `soldFor` each. A partial sale keeps the rest where it was and
 * adds a sold line (with `newId`); selling the whole lot just flips its status.
 */
export function splitLot(items: VaultItem[], id: string, qty: number, soldFor: number, newId: string): VaultItem[] {
  const at = items.findIndex((i) => i.id === id)
  if (at < 0) return items
  const it = items[at]
  const n = Math.max(1, Math.min(it.qty, Math.round(qty)))
  const next = [...items]
  if (n >= it.qty) {
    next[at] = { ...it, status: 'sold', soldFor }
    return next
  }
  next[at] = { ...it, qty: it.qty - n }
  next.splice(at + 1, 0, { ...it, id: newId, qty: n, status: 'sold', soldFor })
  return next
}

// ---------- value over time ----------

export interface Holding {
  /** `${productId}:${variant}` — the key in a set's history file. */
  key: string
  setId: number
  qty: number
  /** Current market price, used to hold the item flat when it has no history. */
  fallback: number | null
}

export interface ValueSeries {
  dates: string[]
  values: number[]
  /** Holdings that had price history. */
  covered: number
  /** Holdings held flat at today's price because they had none. */
  flat: number
}

/**
 * Value of what you hold today, at each past day's prices. Gaps carry the last price forward and
 * the start is back-filled, so a card that only started trading last week doesn't punch holes.
 */
export function valueSeries(holdings: Holding[], histories: Map<number, SetHistory>): ValueSeries {
  const dateSet = new Set<string>()
  for (const h of holdings) for (const d of histories.get(h.setId)?.dates ?? []) dateSet.add(d)
  const dates = [...dateSet].sort()
  const index = new Map(dates.map((d, i) => [d, i]))
  const values: number[] = new Array<number>(dates.length).fill(0)
  let covered = 0
  let flat = 0
  for (const h of holdings) {
    const hist = histories.get(h.setId)
    const series = hist?.series[h.key]
    if (!hist || !series) {
      if (h.fallback != null) {
        for (let i = 0; i < values.length; i++) values[i] += h.fallback * h.qty
        flat++
      }
      continue
    }
    covered++
    const line: Array<number | null> = new Array<number | null>(dates.length).fill(null)
    hist.dates.forEach((d, i) => {
      const at = index.get(d)
      if (at != null) line[at] = series[i] ?? null
    })
    const first = line.find((v) => v != null) ?? h.fallback ?? 0
    let last = first
    for (let i = 0; i < line.length; i++) {
      if (line[i] != null) last = line[i] as number
      values[i] += last * h.qty
    }
  }
  return { dates, values, covered, flat }
}

/** The last `days` days of a series (all of it when null). */
export function sliceRange(s: ValueSeries, days: number | null): ValueSeries {
  if (days == null || s.dates.length <= days) return s
  return { ...s, dates: s.dates.slice(-days), values: s.values.slice(-days) }
}

// ---------- watch targets ----------

/** How far a price is above a target (negative = under it, target hit). */
export function targetGap(price: number | null | undefined, target: number | undefined): { gap: number; pct: number; hit: boolean } | null {
  if (price == null || !target || target <= 0) return null
  return { gap: price - target, pct: price / target - 1, hit: price <= target }
}

// ---------- CSV ----------

/** Quotes a CSV field; user text that starts like a formula gets a leading quote so spreadsheets don't run it. */
export function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return ''
  let s = String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n'
}
