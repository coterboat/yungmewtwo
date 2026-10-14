// Shared data contracts. The pipeline scripts (scripts/*.ts) write these shapes into data/
// and public/data/; the app reads them. Keep this file free of DOM and Node imports.

export type ProductKind = 'card' | 'sealed' | 'code'

export type SealedType =
  | 'booster-box'
  | 'half-box'
  | 'etb'
  | 'pc-etb'
  | 'bundle'
  | 'pack'
  | 'sleeved-pack'
  | 'blister'
  | 'art-bundle'
  | 'build-battle'
  | 'tin'
  | 'upc'
  | 'premium-collection'
  | 'collection'
  | 'case'
  | 'deck'
  | 'accessory'
  | 'other'

/** One TCGplayer product (a single card or a sealed item), from TCGCSV. */
export interface Product {
  id: number
  name: string
  set: number
  kind: ProductKind
  num?: string
  rarity?: string
  sealed?: SealedType
  /** Packs inside a sealed product, when we can tell. */
  packs?: number
  released?: string
  presale?: boolean
  upc?: string
}

/** A TCGplayer group: a set, or a supplemental bucket like promos. */
export interface SetInfo {
  id: number
  name: string
  abbr: string
  lang: 'EN' | 'JP'
  /** Release date most of the group's products share (YYYY-MM-DD). */
  released: string
  supplemental: boolean
  /** First day our pipeline saw this group; null if it was listed before tracking began. */
  firstSeen: string | null
}

/** Price variant codes: N Normal, H Holofoil, R Reverse Holofoil, plus older printings. */
export type Variant = string

/** [market, low] in USD; either may be null. */
export type PricePoint = [number | null, number | null]

/** One day's prices: key `${productId}:${variant}`. */
export interface Snapshot {
  date: string
  source: string
  prices: Record<string, PricePoint>
}
