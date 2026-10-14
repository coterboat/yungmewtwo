import { describe, expect, it } from 'vitest'
import { chainMeta } from './huntChains.ts'
import { appleMapsUrl, chainCounts, customStore, filterViews, hasCoords, mapsUrl, parseLatLng, sortByMiles, viewStores, withPosition } from './huntStores.ts'
import type { Store } from './user.ts'

const mk = (id: string, chain: string, name: string, dist: Record<string, number>, over: Partial<Store> = {}): Store => ({
  id,
  chain,
  name,
  address: `${name} St`,
  lat: 33.9,
  lng: -84.3,
  dist,
  source: 'osm',
  ...over,
})

const stores = [
  mk('t1', 'Target', 'Target Sandy Springs', { alex: 5.6 }),
  mk('t2', 'Target', 'Target Simpsonville', { paul: 1.8 }),
  mk('w1', 'Walmart', 'Walmart Roswell', { alex: 4.6 }),
  mk('shared', 'Costco', 'Costco Middle', { alex: 14, paul: 9 }),
  mk('hid', 'CVS', 'CVS Hidden', { alex: 1 }, { hidden: true }),
  mk('mine', 'Local shop', 'My Card Shop', {}, { source: 'user' }),
]

describe('viewStores', () => {
  it('limits to one person and carries their distance', () => {
    const v = viewStores(stores, 'alex')
    expect(v.map((x) => x.store.id).sort()).toEqual(['mine', 'shared', 't1', 'w1'])
    expect(v.find((x) => x.store.id === 'w1')?.miles).toBe(4.6)
  })
  it('keeps a hand-added store with no distance visible everywhere, with an unknown distance', () => {
    const v = viewStores(stores, 'paul')
    const mine = v.find((x) => x.store.id === 'mine')
    expect(mine).toBeDefined()
    expect(mine?.miles).toBeUndefined()
  })
  it('both: everyone’s stores, each measured from whoever is nearest', () => {
    const v = viewStores(stores, 'both')
    expect(v).toHaveLength(5)
    expect(v.find((x) => x.store.id === 'shared')).toMatchObject({ miles: 9, whose: 'paul' })
    expect(v.find((x) => x.store.id === 't2')).toMatchObject({ miles: 1.8, whose: 'paul' })
  })
  it('hides hidden stores unless asked', () => {
    expect(viewStores(stores, 'alex').some((x) => x.store.id === 'hid')).toBe(false)
    expect(viewStores(stores, 'alex', { hidden: true }).map((x) => x.store.id)).toEqual(['hid'])
  })
})

describe('sorting and filtering', () => {
  it('sorts nearest first with unknown distances last', () => {
    const v = sortByMiles(viewStores(stores, 'alex'))
    expect(v.map((x) => x.store.id)).toEqual(['w1', 't1', 'shared', 'mine'])
  })
  it('re-sorts by where you are standing and ignores stores without coordinates', () => {
    const near = mk('near', 'Target', 'Near', { alex: 9 }, { lat: 33.9, lng: -84.3 })
    const far = mk('far', 'Target', 'Far', { alex: 1 }, { lat: 34.9, lng: -84.3 })
    const nowhere = mk('nowhere', 'Local shop', 'No coords', {}, { source: 'user', lat: 0, lng: 0 })
    const v = withPosition(viewStores([far, near, nowhere], 'alex'), { lat: 33.9001, lng: -84.3001 })
    expect(v.map((x) => x.store.id)).toEqual(['near', 'far', 'nowhere'])
    expect(v[0].miles).toBeLessThan(0.1)
    expect(v[2].miles).toBeUndefined()
  })
  it('filters by chain and by words in the name, chain or address', () => {
    const v = viewStores(stores, 'both')
    expect(filterViews(v, { chain: 'Target' }).map((x) => x.store.id).sort()).toEqual(['t1', 't2'])
    expect(filterViews(v, { query: 'roswell' }).map((x) => x.store.id)).toEqual(['w1'])
    expect(filterViews(v, { query: 'sandy target' }).map((x) => x.store.id)).toEqual(['t1'])
    expect(filterViews(v, { chain: 'all', query: '' })).toHaveLength(v.length)
  })
  it('counts stores per chain, biggest first', () => {
    const c = chainCounts(viewStores(stores, 'both'))
    expect(c[0]).toEqual({ chain: 'Target', count: 2 })
    expect(c.map((x) => x.chain)).toContain('Local shop')
  })
})

describe('coordinates and links', () => {
  it('knows when a store has real coordinates', () => {
    expect(hasCoords({ lat: 33.9, lng: -84.3 })).toBe(true)
    expect(hasCoords({ lat: 0, lng: 0 })).toBe(false)
    expect(hasCoords({ lat: NaN, lng: -84 })).toBe(false)
  })
  it('links to directions by coordinates, falling back to the address', () => {
    expect(mapsUrl(stores[0])).toBe('https://www.google.com/maps/dir/?api=1&destination=33.9,-84.3')
    expect(appleMapsUrl(stores[0])).toContain('daddr=33.9,-84.3')
    const noCoords = mk('x', 'Local shop', 'Card Haven', {}, { lat: 0, lng: 0, address: '1 Main St, Roswell, GA' })
    expect(mapsUrl(noCoords)).toContain('destination=Card%20Haven%2C%201%20Main%20St%2C%20Roswell%2C%20GA')
  })
  it('parses pasted coordinates', () => {
    expect(parseLatLng('33.9795, -84.3411')).toEqual({ lat: 33.9795, lng: -84.3411 })
    expect(parseLatLng('  33.9795 -84.3411 ')).toEqual({ lat: 33.9795, lng: -84.3411 })
    expect(parseLatLng('33.9795')).toBeNull()
    expect(parseLatLng('abc, def')).toBeNull()
    expect(parseLatLng('133, -84')).toBeNull()
  })
})

describe('customStore', () => {
  it('builds a hand-added store with a stable id, with or without coordinates', () => {
    const s = customStore({ name: ' Card Haven ', chain: 'Local shop', address: '1 Main St', coords: { lat: 34.1, lng: -84.2 }, dist: { alex: 3.2 } })
    expect(s).toMatchObject({ chain: 'Local shop', name: 'Card Haven', address: '1 Main St', lat: 34.1, lng: -84.2, dist: { alex: 3.2 }, source: 'user' })
    expect(s.id).toMatch(/^local-card-haven-[0-9a-z]{6}$/)
    expect(customStore({ name: 'Card Haven', chain: 'Local shop', address: '1 Main St', coords: { lat: 34.1, lng: -84.2 }, dist: {} }).id).toBe(s.id)
    const bare = customStore({ name: 'Trade Night', chain: 'Local shop', dist: {} })
    expect(bare).toMatchObject({ lat: 0, lng: 0, dist: {} })
    expect(bare.address).toBeUndefined()
  })
})

describe('chainMeta', () => {
  it('gives known chains a badge and falls back to initials', () => {
    expect(chainMeta('Target')).toMatchObject({ initials: 'TG', intel: 'Target' })
    expect(chainMeta('Walgreens').intel).toBe('Walgreens / CVS')
    expect(chainMeta('Local shop').intel).toBe('Local game stores')
    expect(chainMeta('Kroger').intel).toBeUndefined()
    expect(chainMeta('Hobby Nook')).toMatchObject({ initials: 'HN' })
    expect(chainMeta('Meijer').initials).toBe('ME')
  })
})
