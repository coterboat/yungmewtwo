import { describe, expect, it } from 'vitest'
import { cardHasProduct, cardmarketPrices, cleanCardName, findEuPrice, localIdMatches, nameQuery, rankCandidates, setHintFromName, trendSignal, type TcgdexFetch } from './market-tcgdex.ts'

describe('card names', () => {
  it('strips TCGplayer decorations', () => {
    expect(cleanCardName('Mega Darkrai ex - 116/084')).toBe('Mega Darkrai ex')
    expect(cleanCardName('Giovanni’s Meowth (74)')).toBe('Giovanni’s Meowth')
    expect(cleanCardName('Giratina - 97/214 (Cosmos Holo)')).toBe('Giratina')
    expect(cleanCardName('Welcoming Lantern (Secret)')).toBe('Welcoming Lantern')
    expect(cleanCardName('Unown [S]')).toBe('Unown')
    expect(cleanCardName('Armaldo ex (Non-Holo)')).toBe('Armaldo ex')
    expect(cleanCardName('Pikachu')).toBe('Pikachu')
  })
  it('avoids apostrophes in the API query', () => {
    expect(nameQuery("Giovanni's Meowth")).toBe('s Meowth')
    expect(nameQuery('Mega Darkrai ex')).toBe('Mega Darkrai ex')
  })
  it('compares local ids numerically when both are numbers', () => {
    expect(localIdMatches('052/101', '52')).toBe(true)
    expect(localIdMatches('52/101', '052')).toBe(true)
    expect(localIdMatches('116/084', '116')).toBe(true)
    expect(localIdMatches('TG01/TG30', 'TG01')).toBe(true)
    expect(localIdMatches('52/101', '152')).toBe(false)
    expect(localIdMatches('SWSH001', 'swsh001')).toBe(true)
    expect(localIdMatches('', '1')).toBe(false)
  })
  it('guesses a TCGdex set id from the TCGplayer set name', () => {
    expect(setHintFromName('ME05: Pitch Black')).toBe('me05')
    expect(setHintFromName('SV03.5: 151')).toBe('sv03.5')
    expect(setHintFromName('Base Set')).toBeUndefined()
  })
})

describe('candidate ranking', () => {
  const cands = [
    { id: 'base5-4', localId: '4', name: 'Dark Charizard' },
    { id: 'base1-4', localId: '4', name: 'Charizard' },
    { id: 'sm9-14', localId: '14', name: 'Charizard' },
    { id: 'me05-4', localId: '004', name: 'Charizard' },
  ]
  it('keeps only same-number, same-name cards and puts the set hint first', () => {
    const r = rankCandidates(cands, 'Charizard', '4/102', 'me05')
    expect(r.map((c) => c.id)).toEqual(['me05-4', 'base1-4'])
  })
  it('falls back to a looser name match', () => {
    const r = rankCandidates([{ id: 'x-1', localId: '1', name: 'Pikachu ex' }], 'Pikachu', '1/10', undefined)
    expect(r.map((c) => c.id)).toEqual(['x-1'])
  })
})

const card = {
  id: 'me05-116',
  pricing: {
    cardmarket: { updated: '2026-10-13T22:54:32.797Z', unit: 'EUR', idProduct: 1, avg: 213.22, low: 138, trend: 182.08, avg1: 238.6, avg7: 191.13, avg30: 203.61, 'avg-holo': null, 'low-holo': null, 'trend-holo': 0, 'avg1-holo': null, 'avg7-holo': null, 'avg30-holo': null },
    tcgplayer: { unit: 'USD', holofoil: { productId: 704873, marketPrice: 140.11 } },
  },
}

describe('card parsing', () => {
  it('confirms the card by its TCGplayer product id', () => {
    expect(cardHasProduct(card, 704873)).toBe(true)
    expect(cardHasProduct(card, 5)).toBe(false)
    expect(cardHasProduct({ variants_detailed: [{ thirdParty: { tcgplayer: 42 } }] }, 42)).toBe(true)
    expect(cardHasProduct(null, 1)).toBe(false)
    expect(cardHasProduct({}, 1)).toBe(false)
  })
  it('reads Cardmarket EUR prices, treating 0 as unknown', () => {
    const p = cardmarketPrices(card)!
    expect(p.normal).toMatchObject({ trend: 182.08, avg1: 238.6, avg7: 191.13, avg30: 203.61, low: 138 })
    expect(p.reverse).toBeNull()
    expect(p.updated).toBe('2026-10-13T22:54:32.797Z')
  })
  it('reads reverse-holo prices when present', () => {
    const p = cardmarketPrices({ pricing: { cardmarket: { unit: 'EUR', trend: 1, avg7: 1.1, avg30: 1.2, 'trend-holo': 3, 'avg7-holo': 3.5, 'avg30-holo': 3.2 } } })!
    expect(p.reverse).toMatchObject({ trend: 3, avg7: 3.5, avg30: 3.2 })
  })
  it('returns null without Cardmarket data', () => {
    expect(cardmarketPrices({ pricing: { tcgplayer: {} } })).toBeNull()
    expect(cardmarketPrices({ pricing: { cardmarket: { unit: 'EUR', trend: 0, avg7: null } } })).toBeNull()
  })
})

describe('trend signal', () => {
  it('compares the 7-day average with the 30-day one', () => {
    expect(trendSignal(110, 100)).toEqual({ dir: 'up', pct: 0.1 })
    expect(trendSignal(90, 100)).toEqual({ dir: 'down', pct: -0.1 })
    expect(trendSignal(100.5, 100)?.dir).toBe('flat')
    expect(trendSignal(null, 100)).toBeNull()
    expect(trendSignal(100, 0)).toBeNull()
  })
})

describe('finding the card', () => {
  const listing = [{ id: 'me05-116', localId: '116', name: 'Mega Darkrai ex' }]
  const calls: string[] = []
  const fetcher: TcgdexFetch = async (path) => {
    calls.push(path)
    if (path.startsWith('/cards?')) return listing
    if (path === '/cards/me05-116') return card
    return null
  }
  const args = { productId: 704873, name: 'Mega Darkrai ex - 116/084', num: '116/084', setName: 'ME05: Pitch Black' }
  it('searches by name and number, then confirms the product id', async () => {
    const r = await findEuPrice(args, fetcher)
    expect(r?.id).toBe('me05-116')
    expect(r?.normal.trend).toBe(182.08)
    expect(calls[0]).toContain('name=Mega%20Darkrai%20ex')
    expect(calls[0]).toContain('localId=116')
  })
  it('returns null when no candidate carries our product id', async () => {
    expect(await findEuPrice({ ...args, productId: 1 }, fetcher)).toBeNull()
  })
  it('returns null when the card has no number to search by', async () => {
    expect(await findEuPrice({ ...args, num: '' }, fetcher)).toBeNull()
  })
  it('fails quietly when the network does', async () => {
    const boom: TcgdexFetch = async () => {
      throw new Error('offline')
    }
    expect(await findEuPrice(args, boom)).toBeNull()
  })
})
