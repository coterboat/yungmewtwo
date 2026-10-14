// Contracts for public/data/*.json: what scripts/build-site-data.ts writes and the app reads.
import type { SealedType, SetInfo } from './types.ts'

/** [market, low, change1d, change7d, change30d] — changes are fractions (0.12 = +12%), null when unknown. */
export type VariantPrice = [number | null, number | null, number | null, number | null, number | null]

export interface SiteMeta {
  builtAt: string
  /** Snapshot dates we hold, oldest first. */
  dates: string[]
  latest: string
  counts: { sets: number; products: number; priced: number }
}

export interface SetSummary extends SetInfo {
  products: number
  cards: number
  sealedCount: number
  /** Sum of each card's top-variant market price (a rough "master set" value). */
  value: number
  /** Top cards by price: [productId, name, market]. */
  chase: Array<[number, string, number]>
}

export interface SiteProduct {
  id: number
  name: string
  set: number
  kind: 'card' | 'sealed'
  num?: string
  rarity?: string
  sealed?: SealedType
  packs?: number
  msrp?: number
  released?: string
  presale?: boolean
  /** Prices per variant code (N, H, R, ...). */
  v: Record<string, VariantPrice>
}

/** One search row, kept as a tuple to keep index files small. */
export type IndexRow = [
  id: number,
  name: string,
  set: number,
  kind: 'c' | 's',
  num: string,
  rarity: string,
  /** Headline variant code (the most valuable one). */
  variant: string,
  market: number | null,
  change7d: number | null,
]

export interface SetHistory {
  dates: string[]
  /** `${productId}:${variant}` -> market price per date (null = no price that day). */
  series: Record<string, Array<number | null>>
}

export interface Mover {
  id: number
  name: string
  set: number
  variant: string
  kind: 'card' | 'sealed'
  market: number
  change: number
  from: number
}

export interface Movers {
  /** Window in days -> list. Filled once we have enough snapshots. */
  windows: Record<'1' | '7' | '30', { up: Mover[]; down: Mover[] }>
}

export interface SealedRow {
  id: number
  name: string
  set: number
  lang: 'EN' | 'JP'
  sealed: SealedType
  packs?: number
  msrp?: number
  market: number | null
  low: number | null
  change7d: number | null
  change30d: number | null
  released?: string
  presale?: boolean
}
