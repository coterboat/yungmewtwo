import { describe, expect, it } from 'vitest'
import { buildOverpassQuery, chainFromTags, dedupeCandidates, haversineMiles, mergeStores, nameCandidates, osmToCandidate, placeFromNominatim, shortHash, slug, storeId, toStore, withPlace, type OsmElement } from './huntOsm.ts'
import type { Store } from './user.ts'

describe('geo helpers', () => {
  it('measures miles between points', () => {
    expect(haversineMiles({ lat: 33, lng: -84 }, { lat: 34, lng: -84 })).toBeCloseTo(69.1, 0)
    expect(haversineMiles({ lat: 33.9, lng: -84.3 }, { lat: 33.9, lng: -84.3 })).toBe(0)
  })
  it('slugs and hashes', () => {
    expect(slug("Dick's Sporting Goods")).toBe('dicks-sporting-goods')
    expect(slug('Barnes & Noble')).toBe('barnes-noble')
    expect(shortHash('33.97950,-84.34110')).toMatch(/^[0-9a-z]{6}$/)
    expect(shortHash('a')).not.toBe(shortHash('b'))
  })
  it('makes stable ids from the chain and rounded coordinates', () => {
    const a = storeId('Target', 33.979512, -84.341101)
    expect(a).toMatch(/^target-[0-9a-z]{6}$/)
    expect(storeId('Target', 33.979512, -84.341101)).toBe(a)
    expect(storeId('Target', 33.98, -84.35)).not.toBe(a)
    expect(storeId('Local shop', 33.9, -84.3)).toMatch(/^local-/)
  })
})

describe('chainFromTags', () => {
  it('recognises the big-box and grocery chains by brand or name', () => {
    expect(chainFromTags({ shop: 'department_store', brand: 'Target', name: 'Target' })).toBe('Target')
    expect(chainFromTags({ shop: 'supermarket', name: 'Walmart Supercenter' })).toBe('Walmart')
    expect(chainFromTags({ shop: 'supermarket', name: 'Walmart Neighborhood Market' })).toBe('Walmart')
    expect(chainFromTags({ shop: 'video_games', brand: 'GameStop' })).toBe('GameStop')
    expect(chainFromTags({ shop: 'electronics', name: 'Best Buy' })).toBe('Best Buy')
    expect(chainFromTags({ shop: 'sports', name: 'DICK’S Sporting Goods' })).toBe("Dick's Sporting Goods")
    expect(chainFromTags({ shop: 'sports', brand: "Dick's Sporting Goods" })).toBe("Dick's Sporting Goods")
    expect(chainFromTags({ shop: 'books', name: 'Barnes & Noble' })).toBe('Barnes & Noble')
    expect(chainFromTags({ shop: 'books', name: 'Books-A-Million' })).toBe('Books-A-Million')
    expect(chainFromTags({ shop: 'wholesale', name: 'Costco Wholesale' })).toBe('Costco')
    expect(chainFromTags({ shop: 'wholesale', name: "Sam's Club" })).toBe("Sam's Club")
    expect(chainFromTags({ shop: 'variety_store', name: 'Five Below' })).toBe('Five Below')
    expect(chainFromTags({ amenity: 'pharmacy', name: 'Walgreens' })).toBe('Walgreens')
    expect(chainFromTags({ amenity: 'pharmacy', name: 'CVS Pharmacy' })).toBe('CVS')
    expect(chainFromTags({ shop: 'supermarket', name: 'Kroger' })).toBe('Kroger')
  })
  it('skips the sub-departments and annexes that do not sell cards', () => {
    expect(chainFromTags({ shop: 'optician', name: 'Target Optical' })).toBeNull()
    expect(chainFromTags({ amenity: 'pharmacy', name: 'Walmart Pharmacy' })).toBeNull()
    expect(chainFromTags({ shop: 'tyres', name: 'Costco Tire Center' })).toBeNull()
    expect(chainFromTags({ amenity: 'fuel', name: 'Sam’s Club Fuel Center' })).toBeNull()
    expect(chainFromTags({ shop: 'mobile_phone', name: 'Best Buy Mobile' })).toBeNull()
  })
  it('treats card and game shops as local shops, unless they are a known non-card brand', () => {
    expect(chainFromTags({ shop: 'games', name: 'Sandy Springs Game Vault' })).toBe('Local shop')
    expect(chainFromTags({ shop: 'collector', name: 'Dragon’s Hoard' })).toBe('Local shop')
    expect(chainFromTags({ shop: 'hobby', name: 'Atlanta Hobbies' })).toBe('Local shop')
    expect(chainFromTags({ shop: 'comic', name: 'Comic Book Hero' })).toBe('Local shop')
    expect(chainFromTags({ shop: 'anime', name: 'Anime Corner' })).toBe('Local shop')
    expect(chainFromTags({ shop: 'toys', name: 'Fun Zone' })).toBe('Local shop')
    expect(chainFromTags({ shop: 'toys', name: 'Toys"R"Us', brand: 'Toys"R"Us' })).toBeNull()
    expect(chainFromTags({ shop: 'toys', name: 'Build-A-Bear Workshop', brand: 'Build-A-Bear Workshop' })).toBeNull()
    expect(chainFromTags({ shop: 'hobby', name: 'Hobby Lobby' })).toBeNull()
    expect(chainFromTags({ shop: 'bakery', name: 'Sweet Cakes' })).toBeNull()
    // Coin dealers, RC tracks, brick classes, Warhammer and board-game cafes are not card shops.
    expect(chainFromTags({ shop: 'collector', name: 'Gold & Coins' })).toBeNull()
    expect(chainFromTags({ shop: 'hobby', name: 'Bullet Raceway and Hobbies' })).toBeNull()
    expect(chainFromTags({ shop: 'games', name: 'Giga-bites Café' })).toBeNull()
    expect(chainFromTags({ shop: 'games', name: 'Warhammer' })).toBeNull()
  })
})

describe('osmToCandidate', () => {
  it('uses the center of a way and drops the postcode', () => {
    const el: OsmElement = {
      type: 'way',
      id: 42,
      center: { lat: 33.97951, lon: -84.34111 },
      tags: { shop: 'department_store', name: 'Target', brand: 'Target', 'addr:housenumber': '1100', 'addr:street': 'Hammond Dr', 'addr:city': 'Sandy Springs', 'addr:state': 'GA', 'addr:postcode': '30328' },
    }
    const c = osmToCandidate(el)!
    expect(c).toMatchObject({ chain: 'Target', lat: 33.97951, lng: -84.34111, city: 'Sandy Springs', street: 'Hammond Dr', address: '1100 Hammond Dr, Sandy Springs, GA' })
    expect(JSON.stringify(c)).not.toContain('30328')
  })
  it('reads nodes directly and returns null for non-matches or missing coordinates', () => {
    expect(osmToCandidate({ type: 'node', id: 1, lat: 34.7, lon: -82.3, tags: { shop: 'games', name: 'Card Haven' } })).toMatchObject({ chain: 'Local shop', name: 'Card Haven' })
    expect(osmToCandidate({ type: 'node', id: 2, lat: 34.7, lon: -82.3, tags: { shop: 'bakery', name: 'X' } })).toBeNull()
    expect(osmToCandidate({ type: 'way', id: 3, tags: { shop: 'games', name: 'No Coords' } })).toBeNull()
  })
})

describe('naming and dedupe', () => {
  const t = (id: number, lat: number, lng: number, city: string, street: string, extra: Record<string, string> = {}): OsmElement => ({
    type: 'node',
    id,
    lat,
    lon: lng,
    tags: { shop: 'department_store', name: 'Target', 'addr:city': city, 'addr:street': street, ...extra },
  })

  it('collapses the node and building outline of one store into one', () => {
    const a = osmToCandidate(t(1, 33.9, -84.3, 'Sandy Springs', 'Hammond Dr'))!
    const b = osmToCandidate({ ...t(2, 33.9004, -84.3003, 'Sandy Springs', 'Hammond Dr', { 'addr:housenumber': '1100' }), type: 'way', lat: undefined, lon: undefined, center: { lat: 33.9004, lon: -84.3003 } })!
    const far = osmToCandidate(t(3, 33.95, -84.3, 'Roswell', 'Holcomb Bridge Rd'))!
    const out = dedupeCandidates([a, b, far])
    expect(out).toHaveLength(2)
    // The richer record (with a house number) wins.
    expect(out.find((c) => c.city === 'Sandy Springs')?.address).toContain('1100')
  })
  it('names a chain store by town, and tells same-town stores apart by street', () => {
    const list = dedupeCandidates([
      osmToCandidate(t(1, 33.9, -84.3, 'Sandy Springs', 'Hammond Dr'))!,
      osmToCandidate(t(2, 33.95, -84.35, 'Atlanta', 'Piedmont Rd'))!,
      osmToCandidate(t(3, 33.96, -84.36, 'Atlanta', 'Peachtree Rd'))!,
    ])
    const names = nameCandidates(list).map((c) => c.name)
    expect(names).toContain('Target Sandy Springs')
    expect(names).toContain('Target Atlanta · Piedmont Rd')
    expect(names).toContain('Target Atlanta · Peachtree Rd')
  })
  it('falls back to the street number, then a count, when a street has several', () => {
    const list = nameCandidates(
      dedupeCandidates([
        osmToCandidate(t(1, 33.9, -84.3, 'Atlanta', 'Peachtree Rd', { name: 'CVS Pharmacy', 'addr:housenumber': '842', shop: 'chemist' }))!,
        osmToCandidate(t(2, 33.95, -84.35, 'Atlanta', 'Peachtree Rd', { name: 'CVS Pharmacy', 'addr:housenumber': '3535', shop: 'chemist' }))!,
        osmToCandidate(t(3, 34.2, -84.5, 'Atlanta', 'Peachtree Rd', { name: 'CVS Pharmacy', shop: 'chemist' }))!,
        osmToCandidate(t(4, 34.4, -84.6, 'Atlanta', 'Peachtree Rd', { name: 'CVS Pharmacy', shop: 'chemist' }))!,
      ]),
    ).map((c) => c.name)
    expect(list).toContain('CVS Atlanta · 842 Peachtree Rd')
    expect(list).toContain('CVS Atlanta · 3535 Peachtree Rd')
    expect(new Set(list).size).toBe(4)
  })
  it('keeps the specific Walmart format and an independent shop’s own name', () => {
    const nm = osmToCandidate({ type: 'node', id: 5, lat: 33.9, lon: -84.3, tags: { shop: 'supermarket', name: 'Walmart Neighborhood Market', 'addr:city': 'Roswell' } })!
    const shop = osmToCandidate({ type: 'node', id: 6, lat: 33.8, lon: -84.2, tags: { shop: 'games', name: 'Card Haven', 'addr:city': 'Roswell' } })!
    const named = nameCandidates([nm, shop])
    expect(named[0].name).toBe('Walmart Neighborhood Market Roswell')
    expect(named[1].name).toBe('Card Haven')
  })
})

describe('filling in a missing town', () => {
  it('reads a Nominatim reverse geocode without the postcode', () => {
    const place = placeFromNominatim({ address: { house_number: '404', road: 'Harrison Bridge Road', town: 'Simpsonville', state: 'South Carolina', postcode: '12345', 'ISO3166-2-lvl4': 'US-SC' } })
    expect(place).toEqual({ num: '404', street: 'Harrison Bridge Road', city: 'Simpsonville', state: 'SC' })
    expect(JSON.stringify(place)).not.toContain('12345')
    expect(placeFromNominatim(null)).toEqual({})
  })
  it('adds a town to a store that had none, and to one that had no address at all', () => {
    const bare = osmToCandidate({ type: 'node', id: 1, lat: 34.7, lon: -82.2, tags: { shop: 'video_games', brand: 'GameStop' } })!
    expect(bare.address).toBeUndefined()
    const filled = withPlace(bare, { num: '404', street: 'Harrison Bridge Road', city: 'Simpsonville', state: 'SC' })
    expect(filled).toMatchObject({ city: 'Simpsonville', street: 'Harrison Bridge Road', address: '404 Harrison Bridge Road, Simpsonville, SC' })
    expect(nameCandidates([filled])[0].name).toBe('GameStop Simpsonville')

    const partial = osmToCandidate({ type: 'node', id: 2, lat: 34.7, lon: -82.2, tags: { shop: 'books', name: 'Barnes & Noble', 'addr:housenumber': '50', 'addr:street': 'Barrett Parkway' } })!
    expect(withPlace(partial, { city: 'Kennesaw', state: 'GA' }).address).toBe('50 Barrett Parkway, Kennesaw, GA')
  })
  it('leaves a store that already has a town alone', () => {
    const c = osmToCandidate({ type: 'node', id: 3, lat: 34.7, lon: -82.2, tags: { shop: 'department_store', name: 'Target', 'addr:city': 'Roswell' } })!
    expect(withPlace(c, { city: 'Atlanta', state: 'GA' })).toBe(c)
  })
})

describe('toStore', () => {
  it('keeps only the people it is near and rounds distance to a tenth of a mile', () => {
    const c = osmToCandidate({ type: 'node', id: 1, lat: 33.98, lon: -84.34, tags: { shop: 'department_store', name: 'Target', 'addr:city': 'Atlanta' } })!
    const s = toStore(c, { alex: { lat: 33.9795, lng: -84.3411 }, paul: { lat: 34.6962, lng: -82.2893 } }, 15)!
    expect(Object.keys(s.dist)).toEqual(['alex'])
    expect(s.dist.alex).toBeLessThan(0.5)
    expect(String(s.dist.alex)).toMatch(/^\d+(\.\d)?$/)
    expect(s.source).toBe('osm')
    expect(s.id).toMatch(/^target-/)
  })
  it('drops stores that are not within range of anyone', () => {
    const c = osmToCandidate({ type: 'node', id: 1, lat: 40, lon: -100, tags: { shop: 'games', name: 'Faraway' } })!
    expect(toStore(c, { alex: { lat: 33.9795, lng: -84.3411 } }, 15)).toBeNull()
  })
})

const st = (over: Partial<Store>): Store => ({ id: 'x', chain: 'Target', name: 'Target Roswell', lat: 34, lng: -84.3, dist: { alex: 5 }, source: 'osm', ...over })

describe('mergeStores', () => {
  it('keeps user-added stores and hidden flags, and keeps ids when a store drifts a little', () => {
    const existing = [
      st({ id: 'target-aaaaaa', hidden: true }),
      st({ id: 'local-bbbbbb', chain: 'Local shop', name: 'My Card Shop', source: 'user', dist: {} }),
    ]
    const incoming = [st({ id: 'target-zzzzzz', lat: 34.0003, lng: -84.3002, name: 'Target Roswell (new)', dist: { alex: 5.2 } })]
    const out = mergeStores(existing, incoming, { runPeople: ['alex'], referenced: new Set() })
    const target = out.find((s) => s.chain === 'Target')!
    expect(target).toMatchObject({ id: 'target-aaaaaa', name: 'Target Roswell (new)', hidden: true, dist: { alex: 5.2 } })
    expect(out.find((s) => s.source === 'user')).toMatchObject({ id: 'local-bbbbbb', name: 'My Card Shop' })
    expect(out).toHaveLength(2)
  })
  it('adds new stores and merges distances from another run', () => {
    const existing = [st({ id: 'target-aaaaaa', dist: { alex: 5 } })]
    const incoming = [st({ id: 'target-aaaaaa', dist: { paul: 9.5 } }), st({ id: 'costco-cccccc', chain: 'Costco', name: 'Costco Greer', lat: 34.9, lng: -82.2, dist: { paul: 12 } })]
    const out = mergeStores(existing, incoming, { runPeople: ['paul'], referenced: new Set() })
    expect(out.find((s) => s.id === 'target-aaaaaa')?.dist).toEqual({ alex: 5, paul: 9.5 })
    expect(out.map((s) => s.id).sort()).toEqual(['costco-cccccc', 'target-aaaaaa'])
  })
  it('drops stores that vanished unless they are hidden or have sightings', () => {
    const existing = [st({ id: 'gone-1', lat: 30, lng: -80 }), st({ id: 'gone-2', lat: 31, lng: -80, hidden: true }), st({ id: 'gone-3', lat: 32, lng: -80 })]
    const out = mergeStores(existing, [], { runPeople: ['alex'], referenced: new Set(['gone-3']) })
    expect(out.map((s) => s.id).sort()).toEqual(['gone-2', 'gone-3'])
    // Their old distances survive so they still show up where they used to.
    expect(out.find((s) => s.id === 'gone-3')?.dist).toEqual({ alex: 5 })
  })
  it('keeps a store near only the other person when this run no longer finds it', () => {
    const existing = [st({ id: 'a', dist: { alex: 5, paul: 8 } })]
    const out = mergeStores(existing, [], { runPeople: ['alex'], referenced: new Set() })
    expect(out).toHaveLength(1)
    expect(out[0].dist).toEqual({ paul: 8 })
  })
})

describe('buildOverpassQuery', () => {
  it('searches around the point for the chains and the independent shop tags', () => {
    const q = buildOverpassQuery({ lat: 33.9795, lng: -84.3411 }, 25_000)
    expect(q).toContain('[out:json]')
    expect(q).toContain('around:25000,33.9795,-84.3411')
    expect(q).toContain('Target')
    expect(q).toContain('Five Below')
    expect(q).toContain('collector')
    expect(q).toContain('out center tags')
  })
})
