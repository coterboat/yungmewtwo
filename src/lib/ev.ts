// "Open it or keep it sealed?" math. Community pull rates (data/seed/pullrates.json) say how often
// each hit rarity shows up per pack; the catalog says what the cards of that rarity are worth.
// Everything here is an estimate: pull rates come from sampled packs, and market price is not a
// guaranteed sale price.
import { headline } from './data.ts'
import type { SiteProduct } from './site.ts'

export interface PullTier {
  rarity: string
  /** The tier shows up about once in this many packs (any card of the rarity). null = unmeasured. */
  perPack: number | null
  source?: string
  note?: string
  /** undefined: the rarity string matches the catalog; null: no catalog rarity matches. */
  catalogRarity?: string | null
}

export interface PullRates {
  name: string
  tcgGroupId?: number
  cardsPerPack: number | null
  confidence: 'high' | 'med' | 'low' | null
  note?: string
  tiers: PullTier[]
  /** For era defaults: the seed keys the numbers were drawn from. */
  derivedFrom?: string[]
}

export type PullRateFile = Record<string, PullRates>

export function findPullRates(file: PullRateFile, set: { id: number; abbr: string; lang: 'EN' | 'JP' }): { key: string; rates: PullRates } | undefined {
  if (set.lang !== 'EN') return undefined
  for (const [key, rates] of Object.entries(file)) if (rates.tcgGroupId === set.id) return { key, rates }
  // Entries without a group id match on abbreviation. Entries that have one never do: a
  // supplemental group (e.g. Classic Collection) shares its parent's abbreviation.
  for (const [key, rates] of Object.entries(file)) if (rates.tcgGroupId == null && key === set.abbr) return { key, rates }
  return undefined
}

const usable = (t: PullTier) => t.perPack != null && t.perPack > 0 && t.catalogRarity !== null

export function hasRates(rates: PullRates | undefined): boolean {
  return !!rates && rates.tiers.some(usable)
}

// ---------- tiers ----------

export interface TierCard {
  id: number
  name: string
  price: number
}

export interface TierStat {
  rarity: string
  perPack: number
  /** Chance a given pack has at least one card of this tier (1 / perPack, capped at 1). */
  p: number
  /** Priced cards in the set with this rarity. */
  cards: TierCard[]
  pricedCount: number
  /** All cards in the set with this rarity, priced or not. */
  total: number
  /** Average value of the priced cards (0 if none are priced yet). */
  avg: number
  evPerPack: number
  source?: string
  note?: string
}

export type SkipReason = 'no-rate' | 'no-catalog-match' | 'no-cards'

export interface SkippedTier {
  rarity: string
  reason: SkipReason
  note?: string
}

export const SKIP_LABEL: Record<SkipReason, string> = {
  'no-rate': 'no measured rate',
  'no-catalog-match': "doesn't match a rarity in the catalog",
  'no-cards': 'no cards with this rarity in the set',
}

/** What a card sells for: its headline (most valuable) variant's market, else its lowest listing. */
export function cardPrice(p: SiteProduct): number | null {
  const h = headline(p)
  return h ? (h[1][0] ?? h[1][1]) : null
}

/** Joins pull-rate tiers to the set's cards. `valueOf` maps a market price to what you'd count it as (e.g. net of fees). */
export function buildTiers(rates: PullRates, cards: SiteProduct[], valueOf: (price: number) => number = (x) => x): { tiers: TierStat[]; skipped: SkippedTier[] } {
  const byRarity = new Map<string, SiteProduct[]>()
  for (const c of cards) {
    if (c.kind !== 'card' || !c.rarity) continue
    const list = byRarity.get(c.rarity)
    if (list) list.push(c)
    else byRarity.set(c.rarity, [c])
  }
  const tiers: TierStat[] = []
  const skipped: SkippedTier[] = []
  for (const t of rates.tiers) {
    if (t.perPack == null || t.perPack <= 0) {
      skipped.push({ rarity: t.rarity, reason: 'no-rate', note: t.note })
      continue
    }
    if (t.catalogRarity === null) {
      skipped.push({ rarity: t.rarity, reason: 'no-catalog-match', note: t.note })
      continue
    }
    const all = byRarity.get(t.catalogRarity ?? t.rarity) ?? []
    if (!all.length) {
      skipped.push({ rarity: t.rarity, reason: 'no-cards', note: t.note })
      continue
    }
    const priced: TierCard[] = []
    for (const c of all) {
      const price = cardPrice(c)
      if (price != null && price > 0) priced.push({ id: c.id, name: c.name, price: valueOf(price) })
    }
    const avg = priced.length ? priced.reduce((s, c) => s + c.price, 0) / priced.length : 0
    const p = Math.min(1, 1 / t.perPack)
    tiers.push({ rarity: t.rarity, perPack: t.perPack, p, cards: priced, pricedCount: priced.length, total: all.length, avg, evPerPack: p * avg, source: t.source, note: t.note })
  }
  return { tiers, skipped }
}

// ---------- expected value ----------

export interface OpenEv {
  packs: number
  /** Expected value of the hit tiers, per pack. */
  hitPerPack: number
  /** The bulk / reverse-holo allowance, per pack (an estimate, not from pull rates). */
  bulkPerPack: number
  perPack: number
  hitTotal: number
  bulkTotal: number
  total: number
}

export function openEv(tiers: TierStat[], packs: number, bulkPerPack: number): OpenEv {
  const hitPerPack = tiers.reduce((s, t) => s + t.evPerPack, 0)
  const perPack = hitPerPack + bulkPerPack
  return { packs, hitPerPack, bulkPerPack, perPack, hitTotal: hitPerPack * packs, bulkTotal: bulkPerPack * packs, total: perPack * packs }
}

export type OpenVerdictKind = 'sealed' | 'open' | 'gamble' | 'toss-up' | 'unknown'

export interface OpenVerdict {
  verdict: OpenVerdictKind
  headline: string
}

/**
 * Compares opening against selling it sealed. The average (EV) is pulled up by rare hits, so the
 * median box matters as much: a high EV with a low median is a gamble, not a plan.
 */
export function openVerdict({ ev, median, sealed }: { ev: number; median: number | null; sealed: number | null }): OpenVerdict {
  if (!sealed || sealed <= 0) return { verdict: 'unknown', headline: 'No sealed price to compare' }
  if (ev < sealed * 0.9) return { verdict: 'sealed', headline: 'Keep it sealed' }
  if (ev > sealed * 1.1) {
    if (median != null && median < sealed * 0.85) return { verdict: 'gamble', headline: 'Opening is a gamble' }
    return { verdict: 'open', headline: 'Worth opening' }
  }
  return { verdict: 'toss-up', headline: 'Toss-up' }
}

// ---------- era defaults ----------

export type Era = 'ME' | 'SV'

export function eraOf(setName: string): Era | null {
  if (/^ME(\d+)?\s*[:.]/.test(setName)) return 'ME'
  if (/^SV(\d+(\.\d+)?)?\s*[:.]/.test(setName)) return 'SV'
  return null
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Stand-in pull rates for a set that has none: the median rate per rarity across the sets of the
 * same era that do. Only rarities seen in two or more sets are kept. Always low confidence.
 */
export function eraDefaults(file: PullRateFile, sets: Array<{ id: number; name: string }>, era: Era): PullRates | undefined {
  const eraByGroup = new Map(sets.map((s) => [s.id, eraOf(s.name)]))
  const perRarity = new Map<string, number[]>()
  const from: string[] = []
  const cards: number[] = []
  for (const [key, rates] of Object.entries(file)) {
    if (rates.tcgGroupId == null || eraByGroup.get(rates.tcgGroupId) !== era) continue
    const tiers = rates.tiers.filter(usable)
    if (!tiers.length) continue
    from.push(key)
    if (rates.cardsPerPack) cards.push(rates.cardsPerPack)
    for (const t of tiers) {
      const list = perRarity.get(t.rarity)
      if (list) list.push(t.perPack as number)
      else perRarity.set(t.rarity, [t.perPack as number])
    }
  }
  const tiers: PullTier[] = []
  for (const [rarity, rates] of perRarity) {
    if (rates.length < 2) continue
    tiers.push({ rarity, perPack: Math.round(median(rates) * 10) / 10, source: `median of ${rates.length} ${era}-era sets` })
  }
  if (!tiers.length) return undefined
  return {
    name: `${era}-era defaults`,
    cardsPerPack: cards.length ? median(cards) : null,
    confidence: 'low',
    note: `Not measured for this set. These are the median rates across ${from.length} ${era}-era sets (${from.join(', ')}).`,
    tiers,
    derivedFrom: from,
  }
}
