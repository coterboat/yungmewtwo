import { describe, expect, it } from 'vitest'
import { detectStore, extractUrl, normalizeUrl, safeHref, suggestTitle } from './boardLinks.ts'

describe('extractUrl', () => {
  it('pulls the first link out of pasted text', () => {
    expect(extractUrl('Check this out https://www.target.com/p/x/-/A-1 it is cheap')).toBe('https://www.target.com/p/x/-/A-1')
  })
  it('adds https to a bare domain', () => {
    expect(extractUrl('target.com/p/pokemon-etb/-/A-1')).toBe('https://target.com/p/pokemon-etb/-/A-1')
  })
  it('returns nothing for plain words', () => {
    expect(extractUrl('hello there')).toBeUndefined()
    expect(extractUrl('')).toBeUndefined()
  })
  it('trims trailing punctuation', () => {
    expect(extractUrl('see https://walmart.com/ip/abc/123.')).toBe('https://walmart.com/ip/abc/123')
  })
})

describe('normalizeUrl / safeHref', () => {
  it('only allows http and https', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeHref('javascript:alert(1)')).toBeUndefined()
    expect(safeHref('data:text/html,hi')).toBeUndefined()
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a')
    expect(safeHref(undefined)).toBeUndefined()
  })
  it('accepts a bare domain', () => {
    expect(normalizeUrl(' bestbuy.com/site/x ')).toBe('https://bestbuy.com/site/x')
  })
})

describe('detectStore', () => {
  it.each([
    ['https://www.target.com/p/foo/-/A-1', 'Target'],
    ['https://www.walmart.com/ip/Foo/123', 'Walmart'],
    ['https://www.pokemoncenter.com/product/290-85324/foo', 'Pokémon Center'],
    ['https://www.bestbuy.com/site/foo/6571234.p', 'Best Buy'],
    ['https://www.gamestop.com/toys/foo/1.html', 'GameStop'],
    ['https://www.amazon.com/Foo/dp/B0ABC', 'Amazon'],
    ['https://smile.amazon.com/dp/B0ABC', 'Amazon'],
    ['https://amzn.to/3abc', 'Amazon'],
    ['https://www.dickssportinggoods.com/p/foo', "Dick's Sporting Goods"],
    ['https://www.costco.com/foo.product.1.html', 'Costco'],
    ['https://www.samsclub.com/p/foo/1', "Sam's Club"],
    ['https://www.barnesandnoble.com/w/foo', 'Barnes & Noble'],
    ['https://www.fivebelow.com/products/foo', 'Five Below'],
    ['https://www.tcgplayer.com/product/1/foo', 'TCGplayer'],
    ['https://www.ebay.com/itm/123', 'eBay'],
    ['https://www.booksamillion.com/p/123', 'Books-A-Million'],
    ['https://www.walgreens.com/store/c/foo/ID=1', 'Walgreens'],
    ['https://www.cvs.com/shop/foo', 'CVS'],
  ])('%s -> %s', (url, store) => {
    expect(detectStore(url)).toBe(store)
  })
  it('does not match look-alike domains', () => {
    expect(detectStore('https://nottarget.com/p/foo')).toBeUndefined()
    expect(detectStore('https://target.com.evil.example/p/foo')).toBeUndefined()
  })
  it('returns nothing for unknown or invalid input', () => {
    expect(detectStore('https://example.com/x')).toBeUndefined()
    expect(detectStore('not a url')).toBeUndefined()
    expect(detectStore('')).toBeUndefined()
  })
})

describe('suggestTitle', () => {
  it('reads the product slug', () => {
    expect(suggestTitle('https://www.target.com/p/pokemon-trading-card-game-prismatic-evolutions-elite-trainer-box/-/A-93954435')).toBe(
      'Pokémon Trading Card Game Prismatic Evolutions Elite Trainer Box',
    )
  })
  it('handles Walmart slugs and numeric ids', () => {
    expect(suggestTitle('https://www.walmart.com/ip/Pokemon-TCG-Scarlet-Violet-Booster-Bundle/5432109876?athbdg=L1600')).toBe('Pokémon TCG Scarlet Violet Booster Bundle')
  })
  it('strips file extensions', () => {
    expect(suggestTitle('https://www.bestbuy.com/site/pokemon-tcg-etb-box/6571234.p?skuId=6571234')).toBe('Pokémon TCG ETB Box')
  })
  it('decodes escaped characters', () => {
    expect(suggestTitle('https://www.amazon.com/Pok%C3%A9mon-Booster-Box/dp/B0ABC')).toBe('Pokémon Booster Box')
  })
  it('returns nothing when the path has no readable slug', () => {
    expect(suggestTitle('https://www.ebay.com/itm/123456789')).toBeUndefined()
    expect(suggestTitle('https://www.amazon.com/dp/B0ABCDEF')).toBeUndefined()
    expect(suggestTitle('https://www.pokemoncenter.com/product/290-85324')).toBeUndefined()
    expect(suggestTitle('nonsense')).toBeUndefined()
  })
})
