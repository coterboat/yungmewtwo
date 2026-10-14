import { describe, expect, it } from 'vitest'
import { HEARTBEAT_MS, NEWS_SOURCES, classifyFetch, decodeEntities, keepItem, matchWatch, mergeNews, nextSourceStatus, normalizeLink, parseFeed, stripHtml, tagText, watchTargetFor, type NewsItem } from './dropsNews.ts'

const RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>PokéBeach</title>
    <link>https://www.pokebeach.com/forums/</link>
    <item>
      <title>“Delta Reign” Preorders Now Live on Pokemon Center!</title>
      <pubDate>Wed, 30 Sep 2026 16:04:24 +0000</pubDate>
      <link>https://www.pokebeach.com/2026/09/delta-reign-preorders-now-live-on-pokemon-center</link>
      <guid isPermaLink="false">1</guid>
      <dc:creator>Mew</dc:creator>
      <content:encoded><![CDATA[<div class="bbWrapper">Preorders for <b>Delta Reign</b> are live &amp; queue is up.<br />Limit 1 per item. https://example.com/x</div>]]></content:encoded>
    </item>
    <item>
      <title>Cutest Pok&eacute;mon?</title>
      <pubDate>Wed, 14 Oct 2026 22:02:56 +0000</pubDate>
      <link>https://www.pokebeach.com/forums/threads/cutest-pokemon.1/</link>
      <description>plain &lt;i&gt;text&lt;/i&gt;</description>
    </item>
  </channel>
</rss>`

const ATOM = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>newest submissions : PKMNTCGDeals</title>
<entry><author><name>/u/Chippyrs</name><uri>https://www.reddit.com/user/Chippyrs</uri></author><category term="PKMNTCGDeals" label="r/PKMNTCGDeals"/><content type="html">&lt;table&gt;&lt;tr&gt;&lt;td&gt;&lt;!-- SC_OFF --&gt;&lt;div class=&quot;md&quot;&gt;&lt;p&gt;Link to the lottery here&lt;/p&gt;&lt;/div&gt;&lt;!-- SC_ON --&gt; &amp;#32; submitted by &amp;#32; &lt;a href=&quot;x&quot;&gt; /u/Chippyrs &lt;/a&gt; &lt;br/&gt; &lt;span&gt;&lt;a href=&quot;y&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</content><id>t3_1x62u0z</id><link href="https://www.reddit.com/r/PKMNTCGDeals/comments/1x62u0z/walmart_lottery_live_for_the_next_hour/" /><updated>2026-10-14T20:55:09+00:00</updated><published>2026-10-14T20:55:09+00:00</published><title>Walmart lottery live for the next hour!</title></entry>
<entry><link href="https://www.reddit.com/r/PKMNTCGDeals/comments/1x0/q_a/" /><updated>2026-10-01T14:00:54+00:00</updated><title>Monthly Discord unban form &amp; Q&amp;A thread</title></entry>
</feed>`

describe('feed parsing', () => {
  it('reads RSS items', () => {
    const items = parseFeed(RSS)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      title: '“Delta Reign” Preorders Now Live on Pokemon Center!',
      link: 'https://www.pokebeach.com/2026/09/delta-reign-preorders-now-live-on-pokemon-center',
      date: '2026-09-30T16:04:24.000Z',
      author: 'Mew',
    })
    expect(items[0].summary).toBe('Preorders for Delta Reign are live & queue is up. Limit 1 per item.')
    expect(items[1].title).toBe('Cutest Pokémon?')
    expect(items[1].summary).toBe('plain text')
  })
  it('reads Atom entries, with reddit boilerplate removed', () => {
    const items = parseFeed(ATOM)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      title: 'Walmart lottery live for the next hour!',
      link: 'https://www.reddit.com/r/PKMNTCGDeals/comments/1x62u0z/walmart_lottery_live_for_the_next_hour/',
      date: '2026-10-14T20:55:09.000Z',
      author: 'Chippyrs',
    })
    expect(items[0].summary).toBe('Link to the lottery here')
    expect(items[1].title).toBe('Monthly Discord unban form & Q&A thread')
  })
  it('returns nothing for a Cloudflare challenge page', () => {
    expect(parseFeed('<!DOCTYPE html><html><title>Just a moment...</title></html>')).toEqual([])
  })
})

describe('text helpers', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('Q&amp;A &#039;x&#039; &#x2014; &eacute; &nbsp;|')).toBe("Q&A 'x' — é  |")
  })
  it('strips html to readable text', () => {
    expect(stripHtml('<p>Hi&nbsp;<b>there</b></p><br/><p>again</p><!-- c -->')).toBe('Hi there again')
  })
  it('normalizes links for dedupe', () => {
    expect(normalizeLink('https://www.reddit.com/r/x/comments/1/a/?utm_source=rss#c')).toBe('https://www.reddit.com/r/x/comments/1/a')
  })
})

describe('tagging', () => {
  const tags = (title: string, summary = '') => tagText(title, summary)
  it('finds drawings and retailers', () => {
    expect(tags('Walmart lottery live for the next hour!')).toEqual(['drawing', 'walmart'])
    expect(tags('NEW WALMART LOTTERYS ANNOUNCED')).toContain('drawing')
    expect(tags('Pokemon Center raffle for the UPC')).toEqual(['drawing', 'pokemon-center'])
  })
  it('does not call gameplay drawing a raffle', () => {
    expect(tags('Ways to discard Supporters? drawing cards with serperior')).toEqual([])
  })
  it('finds restocks and drops', () => {
    expect(tags('Target drop schedule Midnight PDT , 3AM EDT Good luck!')).toEqual(['restock', 'target'])
    expect(tags('Costco queue is live Ascended 2 pack!!!')).toEqual(['restock', 'costco'])
    expect(tags('Delta Reign Has loaded on Pokemon center, keep an eye out for a queue')).toEqual(['restock', 'pokemon-center'])
  })
  it('lets pre-orders win over a generic "now live"', () => {
    expect(tags('“Delta Reign” Preorders Now Live on Pokemon Center!')).toEqual(['preorder', 'pokemon-center'])
  })
  it('finds price errors before deals', () => {
    expect(tags('PRICE ERROR: Elite Trainer Box $19.99 at Best Buy')).toEqual(['price-error', 'best-buy'])
    expect(tags('Amazon pricing glitch on booster bundles')).toContain('price-error')
  })
  it('finds deals and reveals', () => {
    expect(tags('Booster bundles 20% off at Walmart')).toEqual(['deal', 'walmart'])
    expect(tags('More “Delta Reign” English Cards Revealed, Including Legendary Pyroduct!')).toEqual(['reveal'])
    expect(tags('Pokemon to Release First-Ever Valentine’s Day TCG Set!')).toEqual(['reveal'])
  })
  it('uses the summary too', () => {
    expect(tags('Heads up', 'Target restock in stores today')).toEqual(['restock', 'target'])
  })
})

describe('watched products', () => {
  const targets = [
    watchTargetFor({ id: 712102, name: 'Delta Reign Elite Trainer Box', kind: 'sealed', sealed: 'etb' }, 'ME06: Delta Reign'),
    watchTargetFor({ id: 712094, name: 'Delta Reign Booster Box', kind: 'sealed', sealed: 'booster-box' }, 'ME06: Delta Reign'),
    watchTargetFor({ id: 99, name: 'Umbreon ex - 161/131', kind: 'card', num: '161/131' }, 'SV8.5: Prismatic Evolutions'),
    watchTargetFor({ id: 98, name: 'Pikachu', kind: 'card' }, 'Base Set'),
  ]
  it('matches a sealed product by set and type', () => {
    expect(matchWatch('Delta Reign ETBs restocked at Target', targets)).toEqual([{ id: 712102, name: 'Delta Reign Elite Trainer Box', level: 'product' }])
    expect(matchWatch('delta reign elite trainer box pre-order', targets).map((m) => m.id)).toEqual([712102])
  })
  it('falls back to the set when no type is named', () => {
    expect(matchWatch('Delta Reign preorders now live', targets).map((m) => [m.id, m.level])).toEqual([
      [712102, 'set'],
      [712094, 'set'],
    ])
  })
  it('matches cards by full name, never a bare one-word name', () => {
    expect(matchWatch('Umbreon ex SIR price spike', targets).map((m) => m.id)).toEqual([99])
    expect(matchWatch('My pikachu collection', targets)).toEqual([])
  })
  it('ignores unrelated text', () => {
    expect(matchWatch('Santa Cruz x Pokemon skateboards', targets)).toEqual([])
  })
})

describe('merging', () => {
  const item = (o: Partial<NewsItem> & { link: string }): NewsItem => ({ id: o.link, source: 's', title: o.link, date: '2026-10-14T00:00:00.000Z', seen: '2026-10-14T00:00:00.000Z', tags: [], ...o })
  it('dedupes by link, keeps the first seen time, unions tags, sorts newest first and caps', () => {
    const old = [item({ link: 'https://a/1', seen: '2026-10-10T00:00:00.000Z', tags: ['deal'] }), item({ link: 'https://a/2', date: '2026-10-13T00:00:00.000Z' })]
    const fresh = [item({ link: 'https://a/1/?utm_source=x', tags: ['deal', 'target'] }), item({ link: 'https://a/3', date: '2026-10-14T05:00:00.000Z' })]
    const merged = mergeNews(old, fresh, 3)
    expect(merged.map((m) => m.link)).toEqual(['https://a/3', 'https://a/1', 'https://a/2'])
    expect(merged[1].seen).toBe('2026-10-10T00:00:00.000Z')
    expect(merged[1].tags).toEqual(['deal', 'target'])
    expect(mergeNews(old, fresh, 2)).toHaveLength(2)
  })
})

describe('fetch classification', () => {
  it('tells blocked from broken', () => {
    expect(classifyFetch(200, '<rss></rss>')).toBe('ok')
    expect(classifyFetch(403, '')).toBe('blocked')
    expect(classifyFetch(429, '')).toBe('error')
    expect(classifyFetch(200, '<html><title>Just a moment...</title>')).toBe('blocked')
    expect(classifyFetch(503, 'Service Unavailable')).toBe('error')
    expect(classifyFetch(undefined, '')).toBe('error')
  })
})

describe('sources', () => {
  const def = (id: string) => NEWS_SOURCES.find((s) => s.id === id)!
  it('keeps everything from the news desk and only tagged items from the noisy feeds', () => {
    expect(keepItem(def('pokebeach'), 'Anything', [], [])).toBe(true)
    expect(keepItem(def('reddit-pokemontcg'), 'Just pulled a Charizard!!', [], [])).toBe(false)
    expect(keepItem(def('reddit-pokemontcg'), 'Target restock today', ['restock', 'target'], [])).toBe(true)
    expect(keepItem(def('reddit-pokemontcg'), 'How to get into the TCG', ['deal'], [])).toBe(false)
    expect(keepItem(def('reddit-pokemontcg'), 'Umbreon ex SIR pulled', [], [{ id: 1, name: 'x', level: 'product' }])).toBe(true)
  })
  it('drops megathreads from the deals sub', () => {
    expect(keepItem(def('reddit-deals'), 'Monthly Informational and Q/A Mega thread!', ['restock'], [])).toBe(false)
    expect(keepItem(def('reddit-deals'), 'Monthly Discord unban form and Q&A thread', ['deal'], [])).toBe(false)
    expect(keepItem(def('reddit-deals'), 'Walmart lottery live for the next hour!', ['drawing'], [])).toBe(true)
  })
  it('only rewrites an unchanged source entry every few hours', () => {
    const d = { name: 'PokéBeach', url: 'https://x' }
    const t0 = '2026-10-14T00:00:00.000Z'
    const first = nextSourceStatus(undefined, d, { status: 'ok', count: 30, newItems: 3 }, t0)
    expect(first).toMatchObject({ status: 'ok', at: t0, lastOk: t0, count: 30 })
    const t1 = new Date(Date.parse(t0) + 30 * 60_000).toISOString()
    expect(nextSourceStatus(first, d, { status: 'ok', count: 30, newItems: 0 }, t1)).toBe(first)
    const t2 = new Date(Date.parse(t0) + HEARTBEAT_MS + 1).toISOString()
    expect(nextSourceStatus(first, d, { status: 'ok', count: 30, newItems: 0 }, t2).at).toBe(t2)
    const blocked = nextSourceStatus(first, d, { status: 'blocked', message: 'HTTP 403', count: 0, newItems: 0 }, t1)
    expect(blocked).toMatchObject({ status: 'blocked', message: 'HTTP 403', at: t1, lastOk: t0 })
  })
})
