import { describe, expect, it } from 'vitest'
import { researchLinks, researchQuery } from './market-research.ts'

describe('research query', () => {
  it('builds "name number set" without repeating the number', () => {
    expect(researchQuery({ name: 'Mega Darkrai ex - 116/084', num: '116/084', set: 'Pitch Black', kind: 'card', lang: 'EN' })).toBe('Mega Darkrai ex 116/084 Pitch Black')
  })
  it('adds the number when the name lacks it', () => {
    expect(researchQuery({ name: 'Jellicent', num: '042/163', set: 'Battle Styles', kind: 'card', lang: 'EN' })).toBe('Jellicent 042/163 Battle Styles')
  })
  it('drops bare numbers in brackets and keeps printing notes', () => {
    expect(researchQuery({ name: "Giovanni's Meowth (74)", num: '074/132', set: 'Gym Challenge', kind: 'card', lang: 'EN' })).toBe("Giovanni's Meowth 074/132 Gym Challenge")
    expect(researchQuery({ name: 'Armaldo ex (Non-Holo)', num: '016/017', set: 'POP Series 1', kind: 'card', lang: 'EN' })).toBe('Armaldo ex Non-Holo 016/017 POP Series 1')
  })
  it('does not repeat the set when a sealed name already has it', () => {
    expect(researchQuery({ name: 'Delta Reign Booster Box', set: 'Delta Reign', kind: 'sealed', lang: 'EN' })).toBe('Delta Reign Booster Box')
    expect(researchQuery({ name: 'Elite Trainer Box', set: 'Perfect Order', kind: 'sealed', lang: 'EN' })).toBe('Elite Trainer Box Perfect Order')
  })
  it('marks Japanese products', () => {
    expect(researchQuery({ name: 'Pikachu', num: '001/050', set: 'Base Expansion Pack', kind: 'card', lang: 'JP' })).toBe('Pikachu 001/050 Base Expansion Pack japanese')
  })
})

describe('research links', () => {
  const links = researchLinks({ id: 704873, name: 'Mega Darkrai ex - 116/084', num: '116/084', set: 'Pitch Black', kind: 'card', lang: 'EN' })
  it('links TCGplayer, eBay sold, PriceCharting and Cardmarket for EN cards', () => {
    expect(links.map((l) => l.id)).toEqual(['tcgplayer', 'ebay', 'pricecharting', 'cardmarket'])
    expect(links[0].url).toBe('https://www.tcgplayer.com/product/704873')
    expect(links[1].url).toBe('https://www.ebay.com/sch/i.html?_nkw=Mega%20Darkrai%20ex%20116%2F084%20Pitch%20Black&LH_Sold=1&LH_Complete=1')
    expect(links[2].url).toBe('https://www.pricecharting.com/search-products?q=pokemon%20Mega%20Darkrai%20ex%20116%2F084%20Pitch%20Black&type=prices')
    expect(links[3].url).toContain('https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=')
  })
  it('skips Cardmarket for sealed and Japanese products', () => {
    expect(researchLinks({ id: 1, name: 'Booster Box', set: 'X', kind: 'sealed', lang: 'EN' }).map((l) => l.id)).not.toContain('cardmarket')
    expect(researchLinks({ id: 1, name: 'Pikachu', num: '1/2', set: 'X', kind: 'card', lang: 'JP' }).map((l) => l.id)).not.toContain('cardmarket')
  })
})
