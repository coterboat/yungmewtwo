// Shapes of the files the two of you write from the app. They live in data/user/ in the repo
// (each post is a commit) and are copied to public/data/user/ on deploy.

export interface Person {
  id: string
  name: string
  /** Rough area, e.g. "Sandy Springs, GA" (ZIPs stay out of the public repo). */
  area: string
  /** Accent color for their posts and chart marks. */
  color: string
}

/** deal: a price somewhere. drawing: raffle / lottery / queue / invite with an entry deadline.
 *  drop: a restock or pre-order going live at a time. event: prerelease, league, card show.
 *  note: anything else. */
export type PostType = 'deal' | 'drawing' | 'drop' | 'event' | 'note'

export interface Post {
  id: string
  type: PostType
  by: string
  at: string
  title: string
  url?: string
  /** Retailer name ("Target", "Pokémon Center", "Dick's", a card shop's name). */
  store?: string
  /** Links to a Store in stores.json when it's a physical location. */
  storeId?: string
  /** Linked TCGplayer product, which lets the app score the deal against market. */
  productId?: number
  price?: number
  qty?: number
  /** When it opens / goes live (ISO). */
  starts?: string
  /** When it closes / expires (ISO). Drawings and deals with an end show a countdown. */
  ends?: string
  where?: string
  note?: string
  tags?: string[]
  /** Per person: drawings 'in' | 'won' | 'lost' | 'skip'; deals 'got' | 'skip'. */
  status?: Record<string, string>
  archived?: boolean
}

export interface Store {
  id: string
  chain: string
  name: string
  address?: string
  lat: number
  lng: number
  /** Miles from each person's area center, for the people it's near. */
  dist: Record<string, number>
  source: 'osm' | 'user'
  hidden?: boolean
}

export type SightingResult = 'stocked' | 'limited' | 'empty' | 'restocking'

export interface Sighting {
  id: string
  store: string
  by: string
  /** When it was seen (ISO). */
  at: string
  result: SightingResult
  /** What was there, free text ("Delta Reign ETBs", "30C bundles"). */
  items?: string[]
  productIds?: number[]
  note?: string
}

export interface WatchItem {
  id: string
  by: string
  productId: number
  variant?: string
  /** Alert when the market (or a listing) drops to this price or below. */
  target?: number
  /** Alert when the market rises to this price or above (sell signal). */
  above?: number
  note?: string
  added: string
}

export type VaultStatus = 'have' | 'want' | 'trade' | 'sold'

export interface VaultItem {
  id: string
  productId: number
  variant?: string
  qty: number
  status: VaultStatus
  /** What you paid per item. */
  cost?: number
  soldFor?: number
  condition?: string
  grade?: string
  note?: string
  added: string
}

/** A weekly thing worth a reminder, e.g. Walmart's Wednesday drawing. */
export interface Recurring {
  id: string
  title: string
  /** 0 = Sunday. */
  weekday: number
  /** "17:00" in tz. */
  time: string
  tz: string
  durationMin?: number
  url?: string
  note?: string
  enabled: boolean
  /** Minutes before start to push an alert. */
  alertBefore?: number
}

/** Files under data/user/ and their empty values. */
export const USER_FILES = {
  people: [] as Person[],
  posts: [] as Post[],
  stores: [] as Store[],
  sightings: [] as Sighting[],
  watch: [] as WatchItem[],
  recurring: [] as Recurring[],
} as const

export type UserFileName = keyof typeof USER_FILES | `vault-${string}`
