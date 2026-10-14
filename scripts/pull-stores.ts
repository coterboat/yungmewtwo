// Builds data/user/stores.json: the directory of places near each of you that sell Pokémon cards
// (big-box and grocery chains plus independent card/game/hobby shops), from OpenStreetMap.
//
// Usage: node scripts/pull-stores.ts alex=<zip> cousin=<zip>
//
// ZIP codes are only ever read from the command line. They're geocoded to a rough center, used
// to measure miles, and thrown away: nothing written to disk or printed contains a ZIP or a
// center point, only each store's distance in miles.
//
// Re-running merges into the existing file: stores you added by hand (source "user") and the
// hidden flags are kept, and ids stay stable even if OSM nudges a store's coordinates.
import { resolve } from 'node:path'
import {
  LOCAL_SHOP,
  buildOverpassQuery,
  dedupeCandidates,
  mergeStores,
  nameCandidates,
  osmToCandidate,
  placeFromNominatim,
  toStore,
  withPlace,
  type Candidate,
  type LatLng,
  type OsmElement,
} from '../src/lib/huntOsm.ts'
import type { Person, Sighting, Store } from '../src/lib/user.ts'
import { DATA, USER_AGENT, fetchJson, readJson, sleep, writeLines } from './lib/io.ts'

const RADIUS_METERS = 25_000 // about 15.5 miles
const KEEP_MILES = 15
// The main instance first; the public servers get overloaded now and then, so fall back to mirrors.
// OVERPASS_URL=<endpoint> tries that one first.
const OVERPASS = [
  ...(process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : []),
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

interface Zippo {
  places?: Array<{ latitude: string; longitude: string }>
}

async function geocode(zip: string): Promise<LatLng> {
  const res = await fetchJson<Zippo>(`https://api.zippopotam.us/us/${zip}`)
  const place = res.places?.[0]
  if (!place) throw new Error('could not geocode a ZIP')
  return { lat: Number(place.latitude), lng: Number(place.longitude) }
}

async function overpass(query: string): Promise<OsmElement[]> {
  let last: unknown
  for (let round = 0; round < 2; round++) {
    for (const url of OVERPASS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(100_000),
        })
        if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`)
        const json = (await res.json()) as { elements?: OsmElement[] }
        return json.elements ?? []
      } catch (err) {
        last = err
        console.warn(`  overpass attempt failed: ${(err as Error).message}`)
        await sleep(5000)
      }
    }
    await sleep(30_000)
  }
  throw last
}

/** OSM sometimes has no town for a store. Ask Nominatim (at most one request a second, as its
 *  usage policy asks) so names can read "GameStop Simpsonville" instead of just "GameStop". */
async function fillMissingTowns(list: Candidate[]): Promise<Candidate[]> {
  const out: Candidate[] = []
  let asked = 0
  for (const c of list) {
    if (c.city) {
      out.push(c)
      continue
    }
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${c.lat}&lon=${c.lng}`
      let res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
      if (res.status === 429) {
        await sleep(10_000)
        res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
      }
      out.push(res.ok ? withPlace(c, placeFromNominatim(await res.json())) : c)
    } catch {
      out.push(c)
    }
    asked++
    await sleep(1100)
  }
  console.log(`looked up the town for ${asked} stores OSM has no town for`)
  return out
}

function parseArgs(args: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const a of args) {
    const m = /^([a-z][a-z0-9-]*)=(\d{5})$/i.exec(a)
    if (!m) throw new Error('Usage: node scripts/pull-stores.ts alex=<5-digit zip> cousin=<5-digit zip>')
    out.push([m[1].toLowerCase(), m[2]])
  }
  if (!out.length) throw new Error('Usage: node scripts/pull-stores.ts alex=<5-digit zip> cousin=<5-digit zip>')
  return out
}

async function main() {
  const people = parseArgs(process.argv.slice(2))
  const known = await readJson<Person[]>(resolve(DATA, 'user', 'people.json'), [])
  for (const [id] of people) if (!known.some((p) => p.id === id)) console.warn(`note: "${id}" is not in people.json`)

  const centroids: Record<string, LatLng> = {}
  const candidates: Candidate[] = []
  for (const [id, zip] of people) {
    centroids[id] = await geocode(zip)
    await sleep(500)
    console.log(`${id}: area located, querying OpenStreetMap...`)
    const elements = await overpass(buildOverpassQuery(centroids[id], RADIUS_METERS))
    const found = elements.map(osmToCandidate).filter((c): c is Candidate => c !== null)
    console.log(`${id}: ${elements.length} OSM elements, ${found.length} look like card sellers`)
    candidates.push(...found)
    if (people.length > 1) await sleep(8000) // be polite to the shared Overpass servers
  }

  const incoming = nameCandidates(await fillMissingTowns(dedupeCandidates(candidates)))
    .map((c) => toStore(c, centroids, KEEP_MILES))
    .filter((s): s is Store => s !== null)

  const path = resolve(DATA, 'user', 'stores.json')
  const existing = await readJson<Store[]>(path, [])
  const sightings = await readJson<Sighting[]>(resolve(DATA, 'user', 'sightings.json'), [])
  const merged = mergeStores(existing, incoming, { runPeople: people.map(([id]) => id), referenced: new Set(sightings.map((s) => s.store)) })
  await writeLines(path, merged.map(orderKeys))

  // Report: stores per chain per person (within 15 miles).
  const ids = people.map(([id]) => id)
  const chains = [...new Set(merged.map((s) => s.chain))].sort((a, b) => (a === LOCAL_SHOP ? 1 : b === LOCAL_SHOP ? -1 : a.localeCompare(b)))
  console.log(`\nstores.json: ${merged.length} stores (${merged.filter((s) => s.source === 'user').length} added by hand, ${merged.filter((s) => s.hidden).length} hidden)`)
  console.log(['chain'.padEnd(24), ...ids.map((i) => i.padStart(8))].join(' '))
  for (const chain of chains) {
    const row = ids.map((i) => String(merged.filter((s) => s.chain === chain && s.dist[i] != null).length).padStart(8))
    console.log([chain.padEnd(24), ...row].join(' '))
  }
  console.log(['total'.padEnd(24), ...ids.map((i) => String(merged.filter((s) => s.dist[i] != null).length).padStart(8))].join(' '))
}

/** Stable key order so diffs stay small. */
function orderKeys(s: Store): Store {
  const { id, chain, name, address, lat, lng, dist, source, hidden } = s
  return { id, chain, name, ...(address ? { address } : {}), lat, lng, dist, source, ...(hidden ? { hidden } : {}) }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
