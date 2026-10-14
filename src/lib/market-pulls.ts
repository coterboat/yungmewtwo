// Makes numbers tangible: how many packs it takes to pull a card (from community pull rates in
// data/seed/pullrates.json), and what a price is "worth" in boosters, ETBs and boxes at retail.
// All of it is estimation and the UI says so.

export interface PullTier {
  rarity: string
  /** Packs per card of this rarity: 80 means one SIR (any SIR) per 80 packs. */
  perPack: number | null
  /** Explicitly null when the tier has no matching printed rarity in the catalog. */
  catalogRarity?: string | null
}

export interface PullSet {
  name: string
  tcgGroupId?: number
  cardsPerPack: number | null
  confidence: string | null
  tiers: PullTier[]
}

export type PullRates = Record<string, PullSet>

/** The pull-rate entry for a set: by TCGplayer group id, or by abbreviation for entries that have no id. */
export function pullSetFor(rates: PullRates | undefined, set: { id: number; abbr: string }): PullSet | undefined {
  if (!rates) return undefined
  const entries = Object.entries(rates)
  return entries.find(([, v]) => v.tcgGroupId === set.id)?.[1] ?? entries.find(([k, v]) => v.tcgGroupId == null && k === set.abbr)?.[1]
}

/** The tier for a printed rarity, if it has a measured rate. */
export function tierFor(ps: PullSet, rarity: string | undefined): PullTier | undefined {
  if (!rarity) return undefined
  return ps.tiers.find((t) => t.rarity === rarity && t.catalogRarity !== null && t.perPack != null && t.perPack > 0)
}

// ---------- retail units ----------

export interface PackUnits {
  pack: number
  etb: number
  box: number
  packsPerBox: number
  packsPerEtb: number
}

export const DEFAULT_UNITS: PackUnits = { pack: 4.49, etb: 49.99, box: 161.64, packsPerBox: 36, packsPerEtb: 9 }

type SeedLike = { byType: Record<string, { msrp?: number | null; packs?: number | null }> }

/** Retail prices and pack counts from the MSRP seed, with the standard numbers as fallback. */
export function unitsFromSeed(seed: SeedLike | undefined): PackUnits {
  const t = seed?.byType
  return {
    pack: t?.pack?.msrp ?? DEFAULT_UNITS.pack,
    etb: t?.etb?.msrp ?? DEFAULT_UNITS.etb,
    box: t?.['booster-box']?.msrp ?? DEFAULT_UNITS.box,
    packsPerBox: t?.['booster-box']?.packs ?? DEFAULT_UNITS.packsPerBox,
    packsPerEtb: t?.etb?.packs ?? DEFAULT_UNITS.packsPerEtb,
  }
}

// ---------- odds ----------

export interface PullOdds {
  /** Packs you'd open, on average, to pull this one card. */
  packsForOne: number
  tierPerPack: number
  cardsInTier: number
  boxes: number
  etbs: number
  /** What those packs cost at retail. */
  costToPull: number
  buyPrice: number | null
  buyInPacks: number | null
  cheaperToBuy: boolean | null
  confidence: string | null
}

/** One card's odds: the tier's per-pack rate times how many cards share the rarity in the set. */
export function pullOdds(ps: PullSet, rarity: string | undefined, cardsInTier: number, price: number | null, u: PackUnits): PullOdds | null {
  const tier = tierFor(ps, rarity)
  if (!tier || tier.perPack == null || cardsInTier < 1) return null
  const packsForOne = tier.perPack * cardsInTier
  const costToPull = packsForOne * u.pack
  return {
    packsForOne,
    tierPerPack: tier.perPack,
    cardsInTier,
    boxes: packsForOne / u.packsPerBox,
    etbs: packsForOne / u.packsPerEtb,
    costToPull,
    buyPrice: price,
    buyInPacks: price != null ? price / u.pack : null,
    cheaperToBuy: price != null ? price < costToPull : null,
    confidence: ps.confidence,
  }
}

// ---------- plain-language numbers ----------

/** Two significant figures: 498 -> 500, 2520 -> 2500, 13.3 -> 13, 2.84 -> 2.8. */
export function sig2(n: number): number {
  return n > 0 ? Number(n.toPrecision(2)) : n
}

export function oddsLabel(packs: number): string {
  const r = sig2(packs)
  return r === 1 ? '1 in 1 pack' : `1 in ~${r.toLocaleString('en-US')} packs`
}

/** 3 -> "3", 2.84 -> "2.8", 31.2 -> "31", 1240 -> "1,240". */
function count(n: number): { text: string; one: boolean } {
  const r = n < 10 ? Math.round(n * 10) / 10 : Math.round(n)
  return { text: r.toLocaleString('en-US'), one: r === 1 }
}

const unit = (n: number, singular: string, plural: string) => {
  const c = count(n)
  return `${c.text} ${c.one ? singular : plural}`
}

/** What a price buys at retail: "31 booster packs · 2.8 ETBs", "14 booster boxes · 45 ETBs". */
export function asMsrpUnits(price: number, u: PackUnits): string {
  if (price < u.pack) return 'under 1 booster pack'
  if (price < u.etb) return unit(price / u.pack, 'booster pack', 'booster packs')
  if (price < u.box) return `${unit(price / u.pack, 'booster pack', 'booster packs')} · ${unit(price / u.etb, 'ETB', 'ETBs')}`
  return `${unit(price / u.box, 'booster box', 'booster boxes')} · ${unit(price / u.etb, 'ETB', 'ETBs')}`
}

/** A number of packs as retail products: "13 booster boxes or 53 ETBs", "2 ETBs", "under one ETB". */
export function packsAsProducts(packs: number, u: PackUnits): string {
  const boxes = packs / u.packsPerBox
  const etbs = packs / u.packsPerEtb
  if (boxes >= 1) return `${unit(boxes, 'booster box', 'booster boxes')} or ${unit(etbs, 'ETB', 'ETBs')}`
  if (etbs >= 1) return unit(etbs, 'ETB', 'ETBs')
  return 'under one ETB'
}

/** A set's value as booster boxes: "3.4 booster boxes", "half a booster box". */
export function boxesLabel(value: number, u: PackUnits): string {
  const boxes = value / u.box
  if (boxes < 0.1) return 'under a tenth of a booster box'
  if (boxes >= 0.45 && boxes <= 0.55) return 'half a booster box'
  if (boxes < 1) return `${Math.round(boxes * 100)}% of a booster box`
  return unit(boxes, 'booster box', 'booster boxes')
}

/** Fraction of the total value held by the `n` priciest items. */
export function shareOfValue(prices: number[], n: number): number {
  const total = prices.reduce((a, b) => a + b, 0)
  if (total <= 0) return 0
  return [...prices].sort((a, b) => b - a).slice(0, n).reduce((a, b) => a + b, 0) / total
}
