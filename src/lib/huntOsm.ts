// Turning OpenStreetMap results into the store directory. Used by scripts/pull-stores.ts (run
// under Node), so this file stays free of DOM and Vite-only imports.
import type { Store } from './user.ts'

export interface LatLng {
  lat: number
  lng: number
}

export interface OsmElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export const LOCAL_SHOP = 'Local shop'

// ---------- geo + ids ----------

export function haversineMiles(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** FNV-1a, base 36, six characters. Not cryptographic; just a short stable fingerprint. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36).padStart(6, '0').slice(-6)
}

/** `target-3f9a2c`: chain slug plus a hash of the location (to about 10 m). */
export function storeId(chain: string, lat: number, lng: number): string {
  return `${chain === LOCAL_SHOP ? 'local' : slug(chain)}-${shortHash(`${lat.toFixed(4)},${lng.toFixed(4)}`)}`
}

// ---------- which OSM things are card sellers ----------

interface ChainDef {
  chain: string
  /** Matched against brand and name. */
  match: RegExp
  /** Pharmacies are the store itself for these. */
  pharmacy?: boolean
}

const CHAINS: ChainDef[] = [
  { chain: 'Target', match: /^target\b/ },
  { chain: 'Walmart', match: /^walmart\b/ },
  { chain: 'GameStop', match: /^gamestop\b/ },
  { chain: 'Best Buy', match: /^best buy\b/ },
  { chain: "Dick's Sporting Goods", match: /^dick.?s (sporting goods|house of sport)/ },
  { chain: 'Barnes & Noble', match: /^barnes (&|and) noble/ },
  { chain: 'Books-A-Million', match: /^books[- ]a[- ]million/ },
  { chain: 'Costco', match: /^costco\b/ },
  { chain: "Sam's Club", match: /^sam.?s club/ },
  { chain: 'Five Below', match: /^five below/ },
  { chain: 'Walgreens', match: /^walgreens/, pharmacy: true },
  { chain: 'CVS', match: /^cvs\b/, pharmacy: true },
  { chain: 'Kroger', match: /^kroger\b/ },
]

/** Departments and annexes that share a chain's name but don't sell cards. */
const ANNEX = /\b(optical|pharmacy|clinic|fuel|gas|tire|tyre|photo|caf[eé]|starbucks|vision|hearing|optometr|mobile|auto|bakery|deli|garden|money|floral|travel|business)\b/
const PHARMACY_ANNEX = /\b(clinic|photo|optical|vision|hearing|optometr)\b/

const LOCAL_SHOP_TAGS = new Set(['games', 'collector', 'hobby', 'comic', 'anime', 'toys'])
/** Non-card brands that sometimes carry a hobby or games shop tag. */
const NOT_CARDS = /hobby lobby|michaels|build.?a.?bear|lego|disney|toys.?r.?us|spencer|hot topic|funko|joann|party city|warhammer|games workshop|caf[eé]|\b(coins?|bricks|raceway|rc)\b/

const norm = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[’‘`´]/g, "'").trim()

/** The normalized chain for an OSM element's tags, `Local shop` for independents, or null when
 *  it isn't somewhere you'd hunt cards. */
export function chainFromTags(tags: Record<string, string>): string | null {
  const name = norm(tags.name)
  const brand = norm(tags.brand)
  const shop = tags.shop
  for (const def of CHAINS) {
    if (!def.match.test(name) && !def.match.test(brand)) continue
    const text = name || brand
    if (def.pharmacy ? PHARMACY_ANNEX.test(text) : ANNEX.test(text)) return null
    if (!shop && !(def.pharmacy && tags.amenity === 'pharmacy')) return null
    return def.chain
  }
  if (!shop || !LOCAL_SHOP_TAGS.has(shop) || !name) return null
  if (NOT_CARDS.test(name) || NOT_CARDS.test(brand)) return null
  // A toy store with a brand is a chain we haven't vetted; only independents count.
  if (shop === 'toys' && (tags.brand || tags['brand:wikidata'])) return null
  return LOCAL_SHOP
}

// ---------- candidates ----------

export interface Candidate {
  chain: string
  /** The name OSM gave it. */
  osmName: string
  name: string
  address?: string
  street?: string
  city?: string
  lat: number
  lng: number
  /** How much address detail OSM has; the richest duplicate wins. */
  richness: number
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5

export function osmToCandidate(el: OsmElement): Candidate | null {
  const tags = el.tags ?? {}
  const chain = chainFromTags(tags)
  if (!chain) return null
  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  if (lat == null || lng == null) return null

  const num = tags['addr:housenumber']
  const street = tags['addr:street']
  const city = tags['addr:city']
  const state = tags['addr:state']
  // Postcodes are left out on purpose: the repo is public and ZIPs stay out of it.
  const line = [num, street].filter(Boolean).join(' ')
  const address = [line, city, state].filter(Boolean).join(', ') || undefined
  const osmName = tags.name ?? tags.brand ?? chain
  const base = chain === LOCAL_SHOP ? osmName : chain === 'Walmart' && /neighborhood market/i.test(osmName) ? 'Walmart Neighborhood Market' : chain
  return {
    chain,
    osmName,
    name: base,
    ...(address ? { address } : {}),
    ...(street ? { street } : {}),
    ...(city ? { city } : {}),
    lat: round5(lat),
    lng: round5(lng),
    richness: [num, street, city, state].filter(Boolean).length,
  }
}

export interface Place {
  num?: string
  street?: string
  city?: string
  state?: string
}

const STATE_FROM_ISO = /^US-([A-Z]{2})$/

/** Pulls a street address out of a Nominatim reverse-geocode response (no postcode, on purpose). */
export function placeFromNominatim(json: unknown): Place {
  const a = ((json as { address?: Record<string, string> } | null)?.address ?? {}) as Record<string, string>
  const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality ?? a.suburb
  const state = STATE_FROM_ISO.exec(a['ISO3166-2-lvl4'] ?? '')?.[1]
  return {
    ...(a.house_number ? { num: a.house_number } : {}),
    ...(a.road ? { street: a.road } : {}),
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
  }
}

/** For a candidate OSM has no town for: adds the town and state (and the street, if it had none)
 *  from a reverse geocode. Candidates that already have a town are returned untouched. */
export function withPlace(c: Candidate, place: Place): Candidate {
  if (c.city || !place.city) return c
  const street = c.street ?? place.street
  const line = c.address ? c.address.split(', ')[0] : [place.num, place.street].filter(Boolean).join(' ')
  const address = [line, place.city, place.state].filter(Boolean).join(', ')
  return { ...c, ...(street ? { street } : {}), city: place.city, address, richness: c.richness + 1 }
}

/** Same chain within about 160 m (a store and its building outline, or its pharmacy counter). */
export function dedupeCandidates(list: Candidate[]): Candidate[] {
  const sorted = [...list].sort((a, b) => b.richness - a.richness || a.lat - b.lat || a.lng - b.lng)
  const kept: Candidate[] = []
  for (const c of sorted) {
    const reach = c.chain === LOCAL_SHOP ? 0.03 : 0.1
    const twin = kept.find((k) => k.chain === c.chain && (c.chain !== LOCAL_SHOP || norm(k.osmName) === norm(c.osmName)) && haversineMiles(k, c) < reach)
    if (!twin) kept.push(c)
  }
  return kept
}

/** Gives chain stores a readable, unique name: "Target Sandy Springs", or "Target Atlanta ·
 *  Piedmont Rd" when a town has more than one (then by street number, then "#2"). */
export function nameCandidates(list: Candidate[]): Candidate[] {
  const named = list.map((c) => ({ ...c, name: c.chain === LOCAL_SHOP ? c.osmName : c.city ? `${c.name} ${c.city}` : c.name }))
  const bases = new Map<Candidate, string>(named.map((c) => [c, c.name]))
  const dupes = () => {
    const groups = new Map<string, Candidate[]>()
    for (const c of named) groups.set(c.name, [...(groups.get(c.name) ?? []), c])
    return [...groups.values()].filter((g) => g.length > 1)
  }
  for (const group of dupes()) {
    for (const c of group) {
      const extra = c.chain === LOCAL_SHOP ? c.city ?? c.street : c.street
      if (extra) c.name = `${bases.get(c)} · ${extra}`
    }
  }
  for (const group of dupes()) {
    for (const c of group) {
      const line = c.address?.split(', ')[0]
      if (line && /^\d/.test(line)) c.name = `${bases.get(c)} · ${line}`
    }
  }
  const seen = new Map<string, number>()
  for (const c of named) {
    const n = (seen.get(c.name) ?? 0) + 1
    seen.set(c.name, n)
    if (n > 1) c.name = `${c.name} #${n}`
  }
  return named
}

/** A Store with miles to each person it's within `maxMiles` of, or null if it's near no one. */
export function toStore(c: Candidate, centroids: Record<string, LatLng>, maxMiles: number): Store | null {
  const dist: Record<string, number> = {}
  for (const [person, at] of Object.entries(centroids)) {
    const miles = haversineMiles(c, at)
    if (miles <= maxMiles) dist[person] = Math.round(miles * 10) / 10
  }
  if (!Object.keys(dist).length) return null
  return {
    id: storeId(c.chain, c.lat, c.lng),
    chain: c.chain,
    name: c.name,
    ...(c.address ? { address: c.address } : {}),
    lat: c.lat,
    lng: c.lng,
    dist,
    source: 'osm',
  }
}

// ---------- merging into the existing file ----------

export interface MergeOptions {
  /** People this run measured distances for. */
  runPeople: string[]
  /** Store ids that sightings point to; these are never dropped. */
  referenced: Set<string>
}

export function mergeStores(existing: Store[], incoming: Store[], opts: MergeOptions): Store[] {
  const out: Store[] = []
  const used = new Set<Store>()
  const without = (dist: Record<string, number>) => Object.fromEntries(Object.entries(dist).filter(([p]) => !opts.runPeople.includes(p)))

  for (const old of existing) {
    if (old.source === 'user') {
      out.push(old)
      continue
    }
    const reach = old.chain === LOCAL_SHOP ? 0.05 : 0.1
    const match =
      incoming.find((s) => !used.has(s) && s.id === old.id) ??
      incoming.find((s) => !used.has(s) && s.chain === old.chain && haversineMiles(s, old) < reach)
    if (match) {
      used.add(match)
      const merged: Store = { ...match, id: old.id, dist: { ...without(old.dist), ...match.dist } }
      if (old.hidden) merged.hidden = true
      out.push(merged)
      continue
    }
    if (old.hidden || opts.referenced.has(old.id)) {
      out.push(old)
      continue
    }
    const dist = without(old.dist)
    if (Object.keys(dist).length) out.push({ ...old, dist })
  }
  for (const s of incoming) if (!used.has(s)) out.push(s)

  return out.sort((a, b) => a.chain.localeCompare(b.chain) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

// ---------- the Overpass query ----------

const CHAIN_NAMES = "Target|Walmart|GameStop|Best Buy|Dick.s (Sporting Goods|House of Sport)|Barnes (&|and) Noble|Books.A.Million|Costco|Sam.s Club|Five Below|Walgreens|CVS|Kroger"

export function buildOverpassQuery(center: LatLng, radiusMeters: number): string {
  const around = `around:${radiusMeters},${center.lat},${center.lng}`
  return [
    '[out:json][timeout:120];',
    '(',
    `  nwr(${around})["shop"]["name"~"^(${CHAIN_NAMES})",i];`,
    `  nwr(${around})["shop"]["brand"~"^(${CHAIN_NAMES})",i];`,
    `  nwr(${around})["amenity"="pharmacy"]["name"~"^(Walgreens|CVS)",i];`,
    `  nwr(${around})["amenity"="pharmacy"]["brand"~"^(Walgreens|CVS)",i];`,
    `  nwr(${around})["shop"~"^(games|collector|hobby|comic|anime|toys)$"];`,
    ');',
    'out center tags;',
  ].join('\n')
}
