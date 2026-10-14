import { describe, expect, it } from 'vitest'
import type { DropRelease } from '../../src/lib/drops.ts'
import type { AlertLogEntry } from '../../src/lib/dropsAlerts.ts'
import type { NewsItem } from '../../src/lib/dropsNews.ts'
import type { Product, SetInfo, Snapshot } from '../../src/lib/types.ts'
import type { Person, Post, Recurring, VaultItem, WatchItem } from '../../src/lib/user.ts'
import {
  capAlerts,
  dedupe,
  dropAlerts,
  drawingAlerts,
  easternNow,
  evaluateAll,
  groupAlerts,
  listingAlerts,
  makePrices,
  moveAlerts,
  newsAlerts,
  ntfyPayload,
  parseTopics,
  postAlerts,
  presaleAlerts,
  preorderWindowAlerts,
  pruneLog,
  recurringAlerts,
  targetAlerts,
  toLogEntry,
  tomorrowAlerts,
  topicsFor,
  type Alert,
  type AlertContext,
} from './alert-rules.ts'

const alex: Person = { id: 'alex', name: 'Alex', area: 'Sandy Springs, GA', color: '#a78bfa' }
const cousin: Person = { id: 'cousin', name: 'Cousin', area: 'Simpsonville, SC', color: '#f5a524' }
// 6pm Eastern on Wednesday 2026-10-14.
const NOW = Date.parse('2026-10-14T22:00:00Z')

const snap = (date: string, prices: Snapshot['prices']): Snapshot => ({ date, source: 'test', prices })
const product = (o: Partial<Product> & { id: number }): Product => ({ name: `Product ${o.id}`, set: 1, kind: 'sealed', sealed: 'etb', ...o })

function ctx(o: Partial<AlertContext> = {}): AlertContext {
  return {
    now: NOW,
    people: [alex, cousin],
    posts: [],
    watch: [],
    recurring: [],
    vaults: {},
    snapshots: [],
    products: new Map(),
    sets: [],
    releases: [],
    news: [],
    newsSources: { reddit: { name: 'r/PKMNTCGDeals' } },
    msrp: { byType: { etb: { msrp: 49.99 }, 'booster-box': { msrp: 161.64 } }, byProduct: {} },
    ...o,
  }
}

const watch = (o: Partial<WatchItem> = {}): WatchItem => ({ id: 'w1', by: 'alex', productId: 10, added: '2026-10-01', ...o })
const withPrice = (market: number | null, low: number | null, extra: Partial<AlertContext> = {}) =>
  ctx({ snapshots: [snap('2026-10-14', { '10:N': [market, low] })], products: new Map([[10, product({ id: 10, name: 'Delta Reign Elite Trainer Box' })]]), ...extra })

describe('price rules', () => {
  it('alerts when the market reaches a watch target, to the person who set it', () => {
    const c = withPrice(87.2, 84, { watch: [watch({ target: 90 })] })
    const [a] = targetAlerts(c, makePrices(c.snapshots))
    expect(a).toMatchObject({ key: 'target:w1', kind: 'watch-target', to: ['alex'], click: 'https://coterboat.github.io/yungmewtwo/#/item/10', repeatDays: 3 })
    expect(a.title).toBe('Delta Reign Elite Trainer Box hit your $90 target')
    expect(a.body).toContain('Market is $87.20, lowest listing $84')
  })
  it('alerts on a listing under the target even when the market is above it', () => {
    const c = withPrice(95, 88, { watch: [watch({ target: 90 })] })
    const [a] = targetAlerts(c, makePrices(c.snapshots))
    expect(a.title).toBe('A Delta Reign Elite Trainer Box listing is under your $90 target')
  })
  it('stays quiet above the target', () => {
    const c = withPrice(95, 92, { watch: [watch({ target: 90 })] })
    expect(targetAlerts(c, makePrices(c.snapshots))).toEqual([])
  })
  it('alerts when the market reaches a sell price', () => {
    const c = withPrice(130, 125, { watch: [watch({ above: 125 })] })
    const [a] = targetAlerts(c, makePrices(c.snapshots))
    expect(a).toMatchObject({ key: 'above:w1', kind: 'sell-target' })
    expect(a.title).toBe('Delta Reign Elite Trainer Box reached your $125 sell price')
  })
  it('watches the variant it was set for', () => {
    const c = ctx({ snapshots: [snap('2026-10-14', { '10:N': [5, 4], '10:H': [50, 45] })], products: new Map([[10, product({ id: 10, kind: 'card' })]]), watch: [watch({ variant: 'H', target: 48 })] })
    expect(targetAlerts(c, makePrices(c.snapshots))).toHaveLength(1)
    const c2 = { ...c, watch: [watch({ variant: 'N', target: 3 })] }
    expect(targetAlerts(c2, makePrices(c2.snapshots))).toEqual([])
  })
  it('flags a listing 20% under market on a watched or wanted item, once per product', () => {
    const vaults: Record<string, VaultItem[]> = { cousin: [{ id: 'v1', productId: 10, qty: 1, status: 'want', added: '2026-10-01' }] }
    const c = withPrice(60, 45, { watch: [watch()], vaults })
    const [a] = listingAlerts(c, makePrices(c.snapshots), new Set())
    expect(a.key).toBe('listing:10')
    expect([...(a.to as string[])].sort()).toEqual(['alex', 'cousin'])
    expect(a.title).toBe('Delta Reign Elite Trainer Box: a listing is 25% under market')
  })
  it('skips cheap items, small gaps, and watch items a target alert already covers', () => {
    const cheap = withPrice(8, 5, { watch: [watch()] })
    expect(listingAlerts(cheap, makePrices(cheap.snapshots), new Set())).toEqual([])
    const small = withPrice(60, 50, { watch: [watch()] })
    expect(listingAlerts(small, makePrices(small.snapshots), new Set())).toEqual([])
    const covered = withPrice(60, 40, { watch: [watch({ target: 50 })] })
    expect(listingAlerts(covered, makePrices(covered.snapshots), new Set(['target:w1']))).toEqual([])
  })
  it('flags big one-day and one-week moves on watched or held items', () => {
    const c = ctx({
      snapshots: [snap('2026-10-13', { '10:N': [100, 95] }), snap('2026-10-14', { '10:N': [118, 110] })],
      products: new Map([[10, product({ id: 10, name: 'Umbreon ex' })]]),
      vaults: { alex: [{ id: 'v', productId: 10, qty: 1, status: 'have', added: '2026-10-01' }] },
    })
    const [a] = moveAlerts(c, makePrices(c.snapshots))
    expect(a).toMatchObject({ key: 'move:10:up', to: ['alex'], tags: ['chart_with_upwards_trend'] })
    expect(a.title).toBe('Umbreon ex jumped 18% in a day')
    const week = ctx({
      snapshots: [snap('2026-10-07', { '10:N': [100, 95] }), snap('2026-10-13', { '10:N': [90, 85] }), snap('2026-10-14', { '10:N': [74, 70] })],
      products: new Map([[10, product({ id: 10, name: 'Umbreon ex' })]]),
      watch: [watch()],
    })
    expect(moveAlerts(week, makePrices(week.snapshots))[0].title).toBe('Umbreon ex dropped 18% in a day')
    const slow = ctx({ snapshots: [snap('2026-10-07', { '10:N': [100, 95] }), snap('2026-10-13', { '10:N': [80, 75] }), snap('2026-10-14', { '10:N': [74, 70] })], watch: [watch()], products: new Map([[10, product({ id: 10, name: 'Umbreon ex' })]]) })
    expect(moveAlerts(slow, makePrices(slow.snapshots))[0].title).toBe('Umbreon ex dropped 26% in a week')
  })
  it('ignores moves on items nobody watches or holds, sold items, and pennies', () => {
    const snaps = [snap('2026-10-13', { '10:N': [100, 95] }), snap('2026-10-14', { '10:N': [150, 140] })]
    expect(moveAlerts(ctx({ snapshots: snaps }), makePrices(snaps))).toEqual([])
    const sold = ctx({ snapshots: snaps, vaults: { alex: [{ id: 'v', productId: 10, qty: 1, status: 'sold', added: '2026-10-01' }] } })
    expect(moveAlerts(sold, makePrices(snaps))).toEqual([])
    const penny = [snap('2026-10-13', { '10:N': [1, 1] }), snap('2026-10-14', { '10:N': [2, 2] })]
    expect(moveAlerts(ctx({ snapshots: penny, watch: [watch()] }), makePrices(penny))).toEqual([])
  })
})

describe('board rules', () => {
  const post = (o: Partial<Post> = {}): Post => ({ id: 'p1', type: 'drawing', by: 'alex', at: '2026-10-14T21:30:00Z', title: 'Target drawing for 30C UPC', ...o })
  it('tells everyone except the author about a new post', () => {
    const [a] = postAlerts(ctx({ posts: [post({ store: 'Target', ends: '2026-10-15T02:00:00Z' })] }))
    expect(a).toMatchObject({ key: 'post:p1', to: ['cousin'], title: 'Alex posted a drawing', click: 'https://coterboat.github.io/yungmewtwo/#/board' })
    expect(a.body).toContain('Target drawing for 30C UPC')
    expect(a.body).toContain('Target')
  })
  it('says "a deal", "a drop", "an event"', () => {
    const titles = postAlerts(ctx({ posts: [post({ id: 'a', type: 'deal', by: 'cousin' }), post({ id: 'b', type: 'drop' }), post({ id: 'c', type: 'event' })] })).map((a) => a.title)
    expect(titles).toEqual(['Cousin posted a deal', 'Alex posted a drop', 'Alex posted an event'])
  })
  it('skips old, archived and future-dated posts', () => {
    const posts = [post({ id: 'old', at: '2026-10-13T10:00:00Z' }), post({ id: 'arch', archived: true }), post({ id: 'future', at: '2026-10-15T10:00:00Z' })]
    expect(postAlerts(ctx({ posts }))).toEqual([])
  })
  it('warns 3 hours and 30 minutes before a drawing closes, only people who have not entered', () => {
    const closing = (min: number, status?: Record<string, string>) => post({ ends: new Date(NOW + min * 60_000).toISOString(), status, url: 'https://t.co/enter' })
    const three = drawingAlerts(ctx({ posts: [closing(150)] }))
    expect(three).toHaveLength(1)
    expect(three[0]).toMatchObject({ key: 'drawing:p1:3h', priority: 4, to: ['alex', 'cousin'] })
    expect(three[0].title).toBe('Drawing closes in 2h 30m: Target drawing for 30C UPC')
    const thirty = drawingAlerts(ctx({ posts: [closing(20, { alex: 'in' })] }))
    expect(thirty[0]).toMatchObject({ key: 'drawing:p1:30m', to: ['cousin'], action: { label: 'Enter now', url: 'https://t.co/enter' } })
    expect(thirty[0].title).toBe('Drawing closes in 20 min: Target drawing for 30C UPC')
    expect(drawingAlerts(ctx({ posts: [closing(20, { alex: 'in', cousin: 'skip' })] }))).toEqual([])
    expect(drawingAlerts(ctx({ posts: [closing(200)] }))).toEqual([])
    expect(drawingAlerts(ctx({ posts: [closing(-5)] }))).toEqual([])
  })
  it('announces a drop going live within the hour', () => {
    const live = (min: number) => post({ type: 'drop', title: 'Pokémon Center restock', starts: new Date(NOW + min * 60_000).toISOString(), store: 'Pokémon Center' })
    const [a] = dropAlerts(ctx({ posts: [live(25)] }))
    expect(a).toMatchObject({ key: 'drop:p1', priority: 4, to: ['alex', 'cousin'] })
    expect(a.title).toBe('Pokémon Center restock goes live in 25 min')
    expect(dropAlerts(ctx({ posts: [live(90)] }))).toEqual([])
    expect(dropAlerts(ctx({ posts: [live(-3)] }))).toEqual([])
  })
})

describe('weekly events', () => {
  const walmart: Recurring = { id: 'walmart-drawing', title: 'Walmart Collectibles Drawing', weekday: 3, time: '17:00', tz: 'America/New_York', durationMin: 60, enabled: true, alertBefore: 10, url: 'https://www.walmart.com/cp/collectibles-drawings/' }
  const at = (iso: string) => ctx({ now: Date.parse(iso), recurring: [walmart] })
  it('alerts inside the lead time plus the 30-minute cron slack', () => {
    // 4:35pm ET = 20:35Z, 25 minutes before.
    const [a] = recurringAlerts(at('2026-10-14T20:35:00Z'))
    expect(a.key).toBe('weekly:walmart-drawing:2026-10-14T21:00:00.000Z')
    expect(a.title).toBe('Walmart Collectibles Drawing starts in 25 min')
    expect(a.to).toBe('all')
    expect(recurringAlerts(at('2026-10-14T19:00:00Z'))).toEqual([])
  })
  it('says it is open while the window is running, and not after', () => {
    const [a] = recurringAlerts(at('2026-10-14T21:20:00Z'))
    expect(a.title).toBe('Walmart Collectibles Drawing is open now')
    expect(a.body).toContain('40 min left')
    expect(recurringAlerts(at('2026-10-14T22:10:00Z'))).toEqual([])
  })
  it('skips disabled events and ones without a lead time', () => {
    expect(recurringAlerts(ctx({ now: Date.parse('2026-10-14T20:35:00Z'), recurring: [{ ...walmart, enabled: false }] }))).toEqual([])
    expect(recurringAlerts(ctx({ now: Date.parse('2026-10-14T20:35:00Z'), recurring: [{ ...walmart, alertBefore: undefined }] }))).toEqual([])
  })
})

describe('release radar rules', () => {
  const set = (o: Partial<SetInfo> & { id: number }): SetInfo => ({ name: `ME08: New Set ${o.id}`, abbr: 'NS', lang: 'EN', released: '2027-01-15', supplemental: false, firstSeen: '2026-10-14', ...o })
  it('announces a newly listed set with its pre-sale prices', () => {
    const products = new Map<number, Product>([
      [20, product({ id: 20, set: 5, name: 'New Set 5 Elite Trainer Box', sealed: 'etb', presale: true, released: '2027-01-15' })],
      [21, product({ id: 21, set: 5, name: 'New Set 5 Booster Box', sealed: 'booster-box', presale: true, released: '2027-01-15' })],
    ])
    const c = ctx({ sets: [set({ id: 5, name: 'ME08: New Set 5' })], products, snapshots: [snap('2026-10-14', { '20:N': [110, 100], '21:N': [250, 240] })] })
    const { alerts, newGroups } = groupAlerts(c, makePrices(c.snapshots), '2026-10-14')
    expect(newGroups.has(5)).toBe(true)
    expect(alerts[0]).toMatchObject({ key: 'group:5', kind: 'new-group', to: 'all' })
    expect(alerts[0].title).toBe('New on TCGplayer: ME08: New Set 5')
    expect(alerts[0].body).toContain('Booster Box $250 (+55% vs MSRP)')
  })
  it('ignores promo buckets and groups seen long ago', () => {
    const c = ctx({ sets: [set({ id: 1, supplemental: true }), set({ id: 2, firstSeen: '2026-09-01' }), set({ id: 3, firstSeen: null })], snapshots: [snap('2026-10-14', {})] })
    expect(groupAlerts(c, makePrices(c.snapshots), '2026-10-14').alerts).toEqual([])
  })
  it('announces pre-sale products that got a price since yesterday, in sets already known', () => {
    const products = new Map<number, Product>([
      [30, product({ id: 30, set: 7, name: 'DLR Bundle', sealed: 'bundle', presale: true, released: '2026-11-06' })],
      [31, product({ id: 31, set: 7, name: 'DLR ETB', sealed: 'etb', presale: true, released: '2026-11-06' })],
    ])
    const c = ctx({
      sets: [set({ id: 7, name: 'ME06: Delta Reign', firstSeen: null })],
      products,
      snapshots: [snap('2026-10-13', { '31:N': [100, 90] }), snap('2026-10-14', { '31:N': [101, 90], '30:N': [70, 60] })],
    })
    const [a] = presaleAlerts(c, makePrices(c.snapshots), '2026-10-14', new Set())
    expect(a).toMatchObject({ key: 'presale:7:2026-10-14', kind: 'new-presale' })
    expect(a.title).toBe('1 new pre-order listing: ME06: Delta Reign')
    expect(presaleAlerts({ ...c, snapshots: [c.snapshots[1]] }, makePrices([c.snapshots[1]]), '2026-10-14', new Set())).toEqual([])
    expect(presaleAlerts(c, makePrices(c.snapshots), '2026-10-14', new Set([7]))).toEqual([])
  })
  const release = (o: Partial<DropRelease>): DropRelease => ({ id: 'r', name: 'Mega Evolution—Aura Seeker', region: 'EN', kind: 'main', date: '2027-01-15', confidence: 'high', origin: 'seed', prerelease: null, preorder: null, products: [], presale: false, ...o })
  it('says a predicted pre-order window is near, and calls it a prediction', () => {
    const r = release({ preorderPrediction: { from: '2026-10-18', to: '2026-10-20', likely: '2026-10-20', weekday: 2, basis: 'last 3 sets opened 37–39 days out, mostly on Wednesdays' } })
    const [a] = preorderWindowAlerts(ctx({ releases: [r] }), '2026-10-14')
    expect(a.title).toBe('Aura Seeker pre-orders may open this week (predicted)')
    expect(a.body).toContain('A prediction, not an announcement')
    expect(preorderWindowAlerts(ctx({ releases: [{ ...r, preorderPrediction: { ...r.preorderPrediction!, from: '2026-11-10', to: '2026-11-12' } }] }), '2026-10-14')).toEqual([])
    expect(preorderWindowAlerts(ctx({ releases: [{ ...r, preorder: { date: '2026-10-10' } }] }), '2026-10-14')).toEqual([])
  })
  it('reminds the evening before a release, a prerelease or a pre-order, not in the morning', () => {
    const r = release({ id: 'dlr', name: 'Mega Evolution—Delta Reign', date: '2026-10-15', prerelease: { start: '2026-10-15', end: '2026-10-23' }, preorder: { date: '2026-10-15', where: 'Pokémon Center' } })
    const evening = tomorrowAlerts(ctx({ releases: [r] })) // 6pm ET
    expect(evening.map((a) => a.kind)).toEqual(['release-tomorrow', 'prerelease-tomorrow', 'preorder-tomorrow'])
    expect(evening[0].title).toBe('Delta Reign comes out tomorrow')
    expect(tomorrowAlerts(ctx({ now: Date.parse('2026-10-14T14:00:00Z'), releases: [r] }))).toEqual([])
    expect(tomorrowAlerts(ctx({ releases: [{ ...r, date: '2026-10-20', prerelease: null, preorder: null }] }))).toEqual([])
  })
})

describe('news rules', () => {
  const item = (o: Partial<NewsItem> & { id: string }): NewsItem => ({ source: 'reddit', title: `Item ${o.id}`, link: `https://example.com/${o.id}`, date: '2026-10-14T21:00:00.000Z', seen: '2026-10-14T21:05:00.000Z', tags: [], ...o })
  it('alerts on price errors, drawings and restocks, most urgent first, at most 3 a run', () => {
    const news = [
      item({ id: '1', tags: ['restock', 'target'] }),
      item({ id: '2', tags: ['drawing', 'walmart'], title: 'Walmart lottery live for the next hour!' }),
      item({ id: '3', tags: ['price-error', 'best-buy'], title: 'Price error: ETB $19' }),
      item({ id: '4', tags: ['restock'] }),
      item({ id: '5', tags: ['reveal'] }),
    ]
    const out = newsAlerts(ctx({ news }))
    expect(out.map((a) => a.key)).toEqual(['news:3', 'news:2', 'news:1'])
    expect(out[0]).toMatchObject({ priority: 4, click: 'https://example.com/3', to: 'all' })
    expect(out[0].body.startsWith('r/PKMNTCGDeals')).toBe(true)
  })
  it('alerts when the news names a watched product, to the people watching it', () => {
    const news = [item({ id: '9', tags: ['reveal'], watch: [{ id: 10, name: 'Delta Reign Elite Trainer Box', level: 'product' }] })]
    const [a] = newsAlerts(ctx({ news, watch: [watch({ by: 'cousin' })] }))
    expect(a.to).toEqual(['cousin'])
    expect(a.body).toContain('mentions Delta Reign Elite Trainer Box from your watchlist')
  })
  it('counts a set-only mention only when the item is a deal, restock or pre-order', () => {
    const w = [{ id: 10, name: 'Delta Reign ETB', level: 'set' as const }]
    expect(newsAlerts(ctx({ news: [item({ id: 'a', tags: ['reveal'], watch: w })], watch: [watch()] }))).toEqual([])
    expect(newsAlerts(ctx({ news: [item({ id: 'b', tags: ['preorder'], watch: w })], watch: [watch()] }))).toHaveLength(1)
  })
  it('ignores stale items', () => {
    expect(newsAlerts(ctx({ news: [item({ id: 'o', tags: ['price-error'], date: '2026-10-14T10:00:00.000Z' })] }))).toEqual([])
  })
})

describe('log, dedupe and cap', () => {
  const alert = (o: Partial<Alert> & { key: string }): Alert => ({ kind: 'board-post', title: o.key, body: '', tags: [], priority: 3, click: 'https://x/#/board', to: 'all', ...o })
  const entry = (key: string, at: string): AlertLogEntry => ({ key, kind: 'k', at, title: key, body: '', click: '', to: 'all', priority: 3 })
  it('never repeats a keyed alert, but repeats a still-true target after its window', () => {
    const target = alert({ key: 'target:w1', kind: 'watch-target', repeatDays: 3 })
    const log = [entry('post:p1', '2026-10-14T12:00:00Z'), entry('target:w1', '2026-10-12T12:00:00Z')]
    expect(dedupe([alert({ key: 'post:p1' }), alert({ key: 'post:p2' }), target], log, NOW).map((a) => a.key)).toEqual(['post:p2'])
    expect(dedupe([target], log, NOW + 24 * 3_600_000).map((a) => a.key)).toEqual(['target:w1'])
    expect(dedupe([alert({ key: 'x' }), alert({ key: 'x' })], [], NOW)).toHaveLength(1)
  })
  it('keeps 60 days of log', () => {
    const log = [entry('old', '2026-07-01T00:00:00Z'), entry('new', '2026-10-01T00:00:00Z')]
    expect(pruneLog(log, NOW).map((e) => e.key)).toEqual(['new'])
  })
  it('sends up to 8 pushes and folds the rest into one summary', () => {
    const all = Array.from({ length: 11 }, (_, i) => alert({ key: `post:${i}`, title: `Post ${i}`, to: ['cousin'] }))
    const c = capAlerts(all)
    expect(c.send).toHaveLength(7)
    expect(c.folded).toHaveLength(4)
    expect(c.summary?.title).toBe('4 more alerts')
    expect(c.summary?.body.split('\n')).toHaveLength(4)
    expect(c.summary?.to).toEqual(['cousin'])
    expect(capAlerts(all.slice(0, 8))).toEqual({ send: all.slice(0, 8), folded: [] })
  })
  it('sends the urgent ones alone', () => {
    const urgent = alert({ key: 'drawing:a:30m', kind: 'drawing-closing', priority: 4 })
    const rest = Array.from({ length: 9 }, (_, i) => alert({ key: `post:${i}` }))
    expect(capAlerts([...rest, urgent]).send[0].key).toBe('drawing:a:30m')
  })
  it('turns an alert into a log entry', () => {
    const e = toLogEntry(alert({ key: 'k', title: 'T', body: 'B', to: ['alex'] }), '2026-10-14T22:00:00Z', true)
    expect(e).toEqual({ key: 'k', kind: 'board-post', at: '2026-10-14T22:00:00Z', title: 'T', body: 'B', click: 'https://x/#/board', to: ['alex'], priority: 3, folded: true })
  })
})

describe('delivery', () => {
  const people = [alex, cousin]
  it('reads one shared topic or one per person', () => {
    expect(parseTopics(undefined)).toEqual({ mode: 'none' })
    expect(parseTopics('  ')).toEqual({ mode: 'none' })
    expect(parseTopics('abc123')).toEqual({ mode: 'shared', topic: 'abc123' })
    expect(parseTopics('alex=a1, Cousin=c1')).toEqual({ mode: 'per-person', byPerson: { alex: 'a1', cousin: 'c1' } })
  })
  it('routes to the right topics', () => {
    const shared = parseTopics('abc')
    const per = parseTopics('alex=a1,cousin=c1')
    expect(topicsFor({ to: ['cousin'] }, shared, people)).toEqual(['abc'])
    expect(topicsFor({ to: ['cousin'] }, per, people)).toEqual(['c1'])
    expect(topicsFor({ to: 'all' }, per, people)).toEqual(['a1', 'c1'])
    expect(topicsFor({ to: ['someone'] }, per, people)).toEqual([])
    expect(topicsFor({ to: 'all' }, { mode: 'none' }, people)).toEqual([])
  })
  it('builds a JSON publish body with priority, tags and click', () => {
    const a: Alert = { key: 'k', kind: 'drawing-closing', title: 'Drawing closes in 20 min', body: 'Target', tags: ['rotating_light'], priority: 4, click: 'https://x/#/board', action: { label: 'Enter now', url: 'https://t.co/e' }, to: 'all' }
    expect(ntfyPayload(a, 'abc', parseTopics('abc'), people)).toEqual({
      topic: 'abc',
      title: 'Drawing closes in 20 min',
      message: 'Target',
      tags: ['rotating_light'],
      priority: 4,
      click: 'https://x/#/board',
      actions: [{ action: 'view', label: 'Enter now', url: 'https://t.co/e', clear: true }],
    })
  })
  it('names the person on a personal alert when everyone shares one topic', () => {
    const a: Alert = { key: 'k', kind: 'watch-target', title: 'ETB hit your $90 target', body: '', tags: [], priority: 3, click: '', to: ['alex'] }
    expect(ntfyPayload(a, 'abc', parseTopics('abc'), people).title).toBe('Alex: ETB hit your $90 target')
    expect(ntfyPayload(a, 'a1', parseTopics('alex=a1,cousin=c1'), people).title).toBe('ETB hit your $90 target')
  })
})

describe('evaluateAll', () => {
  it('runs every rule and finds nothing in an empty world', () => {
    expect(evaluateAll(ctx())).toEqual([])
  })
  it('reads Eastern time', () => {
    expect(easternNow(NOW)).toEqual({ date: '2026-10-14', hour: 18 })
    expect(easternNow(Date.parse('2026-10-15T03:30:00Z'))).toEqual({ date: '2026-10-14', hour: 23 })
  })
})
