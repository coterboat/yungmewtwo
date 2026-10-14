// The store directory as the Hunt screen uses it: who's near what, sorting, search, links.
import { haversineMiles, LOCAL_SHOP, shortHash, slug, type LatLng } from './huntOsm.ts'
import type { Store } from './user.ts'

/** A person id, or 'both'. */
export type Scope = string

export interface StoreView {
  store: Store
  /** Miles from the person the view is for (or from whoever is nearest, for 'both'). */
  miles?: number
  /** In 'both', the person that distance is from. */
  whose?: string
}

/** Stores with real coordinates. Hand-added stores without them are stored as 0,0. */
export function hasCoords(s: { lat: number; lng: number }): boolean {
  return Number.isFinite(s.lat) && Number.isFinite(s.lng) && !(s.lat === 0 && s.lng === 0)
}

/** A hand-added store that never got a distance shows up for everyone. */
const unmeasured = (s: Store) => s.source === 'user' && Object.keys(s.dist ?? {}).length === 0

export function viewStores(stores: Store[], scope: Scope, opts: { hidden?: boolean } = {}): StoreView[] {
  const out: StoreView[] = []
  for (const store of stores) {
    if (!!store.hidden !== !!opts.hidden) continue
    const dist = store.dist ?? {}
    if (scope === 'both') {
      const entries = Object.entries(dist)
      if (!entries.length) {
        if (unmeasured(store)) out.push({ store })
        continue
      }
      const [whose, miles] = entries.reduce((a, b) => (b[1] < a[1] ? b : a))
      out.push({ store, miles, whose })
    } else if (dist[scope] != null) {
      out.push({ store, miles: dist[scope] })
    } else if (unmeasured(store)) {
      out.push({ store })
    }
  }
  return out
}

export function sortByMiles(views: StoreView[]): StoreView[] {
  return [...views].sort((a, b) => (a.miles ?? Infinity) - (b.miles ?? Infinity) || a.store.name.localeCompare(b.store.name))
}

/** Re-measures from a live position (where you're standing). Not stored anywhere. */
export function withPosition(views: StoreView[], pos: LatLng): StoreView[] {
  return sortByMiles(
    views.map((v) => ({
      store: v.store,
      ...(hasCoords(v.store) ? { miles: Math.round(haversineMiles(pos, v.store) * 10) / 10 } : {}),
    })),
  )
}

export function filterViews(views: StoreView[], opts: { chain?: string; query?: string }): StoreView[] {
  const tokens = (opts.query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  return views.filter((v) => {
    if (opts.chain && opts.chain !== 'all' && v.store.chain !== opts.chain) return false
    if (!tokens.length) return true
    const hay = `${v.store.name} ${v.store.chain} ${v.store.address ?? ''}`.toLowerCase()
    return tokens.every((t) => hay.includes(t))
  })
}

export function chainCounts(views: StoreView[]): Array<{ chain: string; count: number }> {
  const counts = new Map<string, number>()
  for (const v of views) counts.set(v.store.chain, (counts.get(v.store.chain) ?? 0) + 1)
  return [...counts.entries()].map(([chain, count]) => ({ chain, count })).sort((a, b) => b.count - a.count || a.chain.localeCompare(b.chain))
}

// ---------- links ----------

const destinationText = (s: Store) => [s.name, s.address].filter(Boolean).join(', ')

export function mapsUrl(s: Store): string {
  const dest = hasCoords(s) ? `${s.lat},${s.lng}` : encodeURIComponent(destinationText(s))
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`
}

export function appleMapsUrl(s: Store): string {
  const dest = hasCoords(s) ? `${s.lat},${s.lng}` : encodeURIComponent(destinationText(s))
  return `https://maps.apple.com/?daddr=${dest}&dirflg=d`
}

/** "33.9795, -84.3411" (as copied from a map app) to a point, or null. */
export function parseLatLng(text: string): LatLng | null {
  const parts = text.trim().split(/[\s,]+/).filter(Boolean)
  if (parts.length !== 2) return null
  const [lat, lng] = parts.map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

// ---------- hand-added stores ----------

export interface CustomStoreInput {
  name: string
  chain: string
  address?: string
  coords?: LatLng | null
  /** Rough miles from each person, where known. */
  dist: Record<string, number>
}

/** A store you add yourself. Without coordinates it's stored at 0,0 (see hasCoords). */
export function customStore(input: CustomStoreInput): Store {
  const name = input.name.trim()
  const address = input.address?.trim() || undefined
  const coords = input.coords ?? { lat: 0, lng: 0 }
  const chainSlug = input.chain === LOCAL_SHOP ? 'local' : slug(input.chain)
  return {
    id: `${chainSlug}-${slug(name)}-${shortHash(`${name}|${address ?? ''}|${coords.lat},${coords.lng}`)}`,
    chain: input.chain,
    name,
    ...(address ? { address } : {}),
    lat: coords.lat,
    lng: coords.lng,
    dist: input.dist,
    source: 'user',
  }
}
