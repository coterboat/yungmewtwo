// The phone-alert rules. Everything here is pure: snapshots, the two of your files, the release
// radar and the news go in; alerts come out. scripts/alerts.ts reads the files, sends the pushes
// to ntfy and keeps the log that stops the same alert going out twice.
import { addDays, daysBetween, msrpFor, shortName, weekdayOf, WEEKDAYS, type DropRelease, type MsrpSeed } from '../../src/lib/drops.ts'
import type { AlertLogEntry } from '../../src/lib/dropsAlerts.ts'
import { TAG_LABEL, type NewsItem } from '../../src/lib/dropsNews.ts'
import { nextOccurrence } from '../../src/lib/recurring.ts'
import type { Product, SetInfo, Snapshot } from '../../src/lib/types.ts'
import type { Person, Post, PostType, Recurring, VaultItem, WatchItem } from '../../src/lib/user.ts'

export const SITE = 'https://coterboat.github.io/yungmewtwo/'
export const MAX_PUSHES = 8
export const LOG_DAYS = 60

export interface Alert {
  /** Stable key; the log uses it so the same thing never goes out twice. */
  key: string
  /** Rule name; also decides the order when there are too many to send. */
  kind: string
  title: string
  body: string
  /** ntfy emoji shortcodes. */
  tags: string[]
  /** ntfy priority: 1 min, 3 default, 4 high, 5 max. */
  priority: 3 | 4 | 5
  click: string
  /** An extra button on the notification. */
  action?: { label: string; url: string }
  /** "all" or person ids. */
  to: 'all' | string[]
  /** A still-true condition (a price target) may go out again after this many days. */
  repeatDays?: number
}

export interface AlertContext {
  now: number
  people: Person[]
  posts: Post[]
  watch: WatchItem[]
  recurring: Recurring[]
  vaults: Record<string, VaultItem[]>
  /** Oldest first; the last one is the latest. */
  snapshots: Snapshot[]
  products: Map<number, Product>
  sets: SetInfo[]
  releases: DropRelease[]
  news: NewsItem[]
  newsSources: Record<string, { name: string }>
  msrp: MsrpSeed
}

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

// ---------- helpers ----------

export const link = (path: string) => `${SITE}#${path}`

const usd = (n: number) => `$${n.toFixed(2).replace(/\.00$/, '')}`
const pctText = (f: number) => `${Math.abs(Math.round(f * 100))}%`
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** Date and hour in US Eastern time, where both of you hunt. */
export function easternNow(now: number): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }).formatToParts(new Date(now))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 }
}

function minutesText(ms: number): string {
  const m = Math.max(1, Math.round(ms / MIN))
  if (m < 90) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest >= 10 ? `${h}h ${rest}m` : `${h}h`
}

export interface Prices {
  latest: Snapshot | undefined
  previous: Snapshot | undefined
  /** Market and lowest listing of a product (the variant it was watched at, else its priciest one). */
  view(productId: number, variant?: string): { key: string; market: number | null; low: number | null } | undefined
  /** Fractional change of the market price over `days`, or null when we don't hold history that old. */
  change(key: string, days: number): number | null
}

export function makePrices(snapshots: Snapshot[]): Prices {
  const latest = snapshots[snapshots.length - 1]
  const previous = snapshots[snapshots.length - 2]
  const keysOf = new Map<number, string[]>()
  if (latest) {
    for (const key of Object.keys(latest.prices)) {
      const id = Number(key.slice(0, key.indexOf(':')))
      const list = keysOf.get(id)
      if (list) list.push(key)
      else keysOf.set(id, [key])
    }
  }
  return {
    latest,
    previous,
    view(productId, variant) {
      if (!latest) return undefined
      const keys = variant ? [`${productId}:${variant}`] : (keysOf.get(productId) ?? [])
      let best: { key: string; market: number | null; low: number | null } | undefined
      let bestM = -1
      for (const key of keys) {
        const p = latest.prices[key]
        if (!p) continue
        const m = p[0] ?? p[1] ?? -1
        if (!best || m > bestM) {
          best = { key, market: p[0], low: p[1] }
          bestM = m
        }
      }
      return best
    },
    change(key, days) {
      if (!latest || snapshots.length < 2) return null
      const now = latest.prices[key]?.[0]
      if (now == null) return null
      for (let i = snapshots.length - 2; i >= 0; i--) {
        const age = daysBetween(snapshots[i].date, latest.date)
        if (age < days) continue
        if (age > days * 1.5 + 2) return null
        const then = snapshots[i].prices[key]?.[0]
        return then ? (now - then) / then : null
      }
      return null
    },
  }
}

const nameOf = (ctx: AlertContext, productId: number) => ctx.products.get(productId)?.name ?? `Product ${productId}`
const personName = (ctx: AlertContext, id: string) => ctx.people.find((p) => p.id === id)?.name ?? id

/** Watched products, then vault items, as {person, product} rows. */
function interest(ctx: AlertContext): Array<{ person: string; productId: number; variant?: string; source: 'watch' | VaultItem['status']; watch?: WatchItem }> {
  const rows: ReturnType<typeof interest> = []
  for (const w of ctx.watch) rows.push({ person: w.by, productId: w.productId, variant: w.variant, source: 'watch', watch: w })
  for (const [person, items] of Object.entries(ctx.vaults)) for (const v of items) rows.push({ person, productId: v.productId, variant: v.variant, source: v.status })
  return rows
}

// ---------- price rules ----------

/** Market at or under a watch target (or the lowest listing at or under it), and market at or over a sell price. */
export function targetAlerts(ctx: AlertContext, prices: Prices): Alert[] {
  const out: Alert[] = []
  for (const w of ctx.watch) {
    const v = prices.view(w.productId, w.variant)
    if (!v) continue
    const name = nameOf(ctx, w.productId)
    const click = link(`/item/${w.productId}`)
    if (w.target != null) {
      const marketHit = v.market != null && v.market <= w.target
      const listingHit = !marketHit && v.low != null && v.low <= w.target
      if (marketHit || listingHit) {
        out.push({
          key: `target:${w.id}`,
          kind: 'watch-target',
          title: marketHit ? `${name} hit your ${usd(w.target)} target` : `A ${name} listing is under your ${usd(w.target)} target`,
          body: marketHit
            ? `Market is ${usd(v.market!)}${v.low != null ? `, lowest listing ${usd(v.low)}` : ''}. Your target was ${usd(w.target)}.`
            : `Lowest listing is ${usd(v.low!)}; the market is ${v.market != null ? usd(v.market) : 'unknown'}. Your target was ${usd(w.target)}.`,
          tags: ['dart', 'chart_with_downwards_trend'],
          priority: 3,
          click,
          to: [w.by],
          repeatDays: 3,
        })
      }
    }
    if (w.above != null && v.market != null && v.market >= w.above) {
      out.push({
        key: `above:${w.id}`,
        kind: 'sell-target',
        title: `${name} reached your ${usd(w.above)} sell price`,
        body: `Market is ${usd(v.market)}. Time to sell?`,
        tags: ['moneybag', 'chart_with_upwards_trend'],
        priority: 3,
        click,
        to: [w.by],
        repeatDays: 3,
      })
    }
  }
  return out
}

/** A listing at least 20% under market on something watched or wanted (market $10 or more). */
export function listingAlerts(ctx: AlertContext, prices: Prices, taken: Set<string>): Alert[] {
  const byProduct = new Map<number, Set<string>>()
  for (const r of interest(ctx)) {
    if (r.source !== 'watch' && r.source !== 'want') continue
    // The target alert already says it for this watch item.
    if (r.watch && taken.has(`target:${r.watch.id}`)) continue
    const set = byProduct.get(r.productId) ?? new Set()
    set.add(r.person)
    byProduct.set(r.productId, set)
  }
  const out: Alert[] = []
  for (const [productId, people] of byProduct) {
    const v = prices.view(productId)
    if (!v || v.market == null || v.low == null || v.market < 10 || v.low > v.market * 0.8) continue
    out.push({
      key: `listing:${productId}`,
      kind: 'listing-deal',
      title: `${nameOf(ctx, productId)}: a listing is ${pctText(1 - v.low / v.market)} under market`,
      body: `Lowest listing ${usd(v.low)} vs market ${usd(v.market)}. A listing can be a worse condition than the market price assumes, so check it before you buy.`,
      tags: ['eyes', 'moneybag'],
      priority: 3,
      click: link(`/item/${productId}`),
      to: [...people],
      repeatDays: 3,
    })
  }
  return out
}

/** Watched or held products moving 15% in a day or 25% in a week (market $5 or more). */
export function moveAlerts(ctx: AlertContext, prices: Prices): Alert[] {
  const byProduct = new Map<number, { people: Set<string>; variant?: string }>()
  for (const r of interest(ctx)) {
    if (r.source === 'sold') continue
    const e = byProduct.get(r.productId) ?? { people: new Set<string>(), variant: r.variant }
    e.people.add(r.person)
    byProduct.set(r.productId, e)
  }
  const out: Alert[] = []
  for (const [productId, e] of byProduct) {
    const v = prices.view(productId, e.variant)
    if (!v || v.market == null || v.market < 5) continue
    const c1 = prices.change(v.key, 1)
    const c7 = prices.change(v.key, 7)
    const day = c1 != null && Math.abs(c1) >= 0.15
    const week = c7 != null && Math.abs(c7) >= 0.25
    if (!day && !week) continue
    const lead = day ? c1! : c7!
    const up = lead > 0
    out.push({
      key: `move:${productId}:${up ? 'up' : 'down'}`,
      kind: 'big-move',
      title: `${nameOf(ctx, productId)} ${up ? 'jumped' : 'dropped'} ${pctText(lead)} in ${day ? 'a day' : 'a week'}`,
      body: `Market is ${usd(v.market)}${c1 != null ? `, 1 day ${c1 > 0 ? '+' : '−'}${pctText(c1)}` : ''}${c7 != null ? `, 7 days ${c7 > 0 ? '+' : '−'}${pctText(c7)}` : ''}.`,
      tags: [up ? 'chart_with_upwards_trend' : 'chart_with_downwards_trend'],
      priority: 3,
      click: link(`/item/${productId}`),
      to: [...e.people],
      repeatDays: 3,
    })
  }
  return out
}

// ---------- board rules ----------

const POST_LABEL: Record<PostType, string> = { deal: 'a deal', drawing: 'a drawing', drop: 'a drop', event: 'an event', note: 'a note' }
const POST_TAG: Record<PostType, string> = { deal: 'moneybag', drawing: 'ticket', drop: 'package', event: 'calendar', note: 'memo' }
/** A post this old is not news any more (and keeps the first run from replaying history). */
const POST_FRESH_MS = 6 * HOUR

export function postAlerts(ctx: AlertContext): Alert[] {
  const out: Alert[] = []
  for (const p of ctx.posts) {
    if (p.archived || ctx.now - Date.parse(p.at) > POST_FRESH_MS || Date.parse(p.at) > ctx.now + HOUR) continue
    const to = ctx.people.filter((x) => x.id !== p.by).map((x) => x.id)
    if (!to.length) continue
    const bits = [p.store, p.price != null ? usd(p.price) : '', p.ends ? `closes ${new Date(p.ends).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })} ET` : ''].filter(Boolean)
    out.push({
      key: `post:${p.id}`,
      kind: 'board-post',
      title: `${personName(ctx, p.by)} posted ${POST_LABEL[p.type]}`,
      body: `${clip(p.title, 90)}${bits.length ? ` · ${bits.join(' · ')}` : ''}`,
      tags: [POST_TAG[p.type]],
      priority: 3,
      click: link('/board'),
      ...(p.url ? { action: { label: 'Open link', url: p.url } } : {}),
      to,
    })
  }
  return out
}

/** Drawings that close in the next 3 hours, and again inside 30 minutes. Only people who haven't entered or passed. */
export function drawingAlerts(ctx: AlertContext): Alert[] {
  const out: Alert[] = []
  for (const p of ctx.posts) {
    if (p.archived || p.type !== 'drawing' || !p.ends) continue
    const left = Date.parse(p.ends) - ctx.now
    if (left <= 0 || left > 3 * HOUR) continue
    const to = ctx.people.map((x) => x.id).filter((id) => !['in', 'won', 'lost', 'skip'].includes(p.status?.[id] ?? ''))
    if (!to.length) continue
    const urgent = left <= 30 * MIN
    out.push({
      key: `drawing:${p.id}:${urgent ? '30m' : '3h'}`,
      kind: 'drawing-closing',
      title: `Drawing closes in ${minutesText(left)}: ${clip(p.title, 70)}`,
      body: [p.store, p.url ? 'Entry link is on the notification.' : 'Open the board for the details.', 'You haven\'t marked it as entered.'].filter(Boolean).join(' · '),
      tags: ['rotating_light', 'ticket'],
      priority: 4,
      click: link('/board'),
      ...(p.url ? { action: { label: 'Enter now', url: p.url } } : {}),
      to,
    })
  }
  return out
}

/** Drops (restocks, pre-orders) going live within the hour. */
export function dropAlerts(ctx: AlertContext): Alert[] {
  const out: Alert[] = []
  for (const p of ctx.posts) {
    if (p.archived || p.type !== 'drop' || !p.starts) continue
    const left = Date.parse(p.starts) - ctx.now
    if (left <= 0 || left > HOUR) continue
    const to = ctx.people.map((x) => x.id).filter((id) => p.status?.[id] !== 'skip')
    out.push({
      key: `drop:${p.id}`,
      kind: 'drop-live',
      title: `${clip(p.title, 70)} goes live in ${minutesText(left)}`,
      body: [p.store, p.price != null ? usd(p.price) : '', p.note].filter(Boolean).join(' · ') || 'Posted on the board.',
      tags: ['package', 'alarm_clock'],
      priority: 4,
      click: link('/board'),
      ...(p.url ? { action: { label: 'Open link', url: p.url } } : {}),
      to,
    })
  }
  return out
}

/** Weekly events (the Walmart drawing) shortly before they start. The slack covers the 30-minute cron. */
export const CRON_SLACK_MIN = 30

export function recurringAlerts(ctx: AlertContext): Alert[] {
  const out: Alert[] = []
  for (const r of ctx.recurring) {
    if (!r.enabled || r.alertBefore == null) continue
    let start: number
    try {
      start = nextOccurrence(r, ctx.now).getTime()
    } catch {
      continue
    }
    const end = start + (r.durationMin ?? 0) * MIN
    const lead = (r.alertBefore + CRON_SLACK_MIN) * MIN
    if (ctx.now < start - lead || ctx.now >= end) continue
    const live = ctx.now >= start
    out.push({
      key: `weekly:${r.id}:${new Date(start).toISOString()}`,
      kind: 'weekly-event',
      title: live ? `${r.title} is open now` : `${r.title} starts in ${minutesText(start - ctx.now)}`,
      body: live ? `About ${minutesText(end - ctx.now)} left to enter.` : `${WEEKDAYS[r.weekday].replace(/s$/, '')} ${r.time} (${r.tz.split('/')[1]?.replace(/_/g, ' ') ?? r.tz}).${r.note ? ` ${clip(r.note, 80)}` : ''}`,
      tags: ['alarm_clock', 'ticket'],
      priority: 4,
      click: link('/board'),
      ...(r.url ? { action: { label: 'Open page', url: r.url } } : {}),
      to: 'all',
    })
  }
  return out
}

// ---------- release radar rules ----------

/** A new TCGplayer group (not promos), with any pre-sale prices it already has. */
export function groupAlerts(ctx: AlertContext, prices: Prices, today: string): { alerts: Alert[]; newGroups: Set<number> } {
  const alerts: Alert[] = []
  const newGroups = new Set<number>()
  const byGroup = new Map<number, Product[]>()
  for (const p of ctx.products.values()) {
    if (p.kind !== 'sealed' || !p.sealed || p.sealed === 'case') continue
    const list = byGroup.get(p.set)
    if (list) list.push(p)
    else byGroup.set(p.set, [p])
  }
  for (const s of ctx.sets) {
    if (s.supplemental || !s.firstSeen || daysBetween(s.firstSeen, today) > 1 || daysBetween(s.firstSeen, today) < 0) continue
    newGroups.add(s.id)
    const lines = presaleLines(ctx, prices, s, byGroup.get(s.id) ?? [], today, 3)
    alerts.push({
      key: `group:${s.id}`,
      kind: 'new-group',
      title: `New on TCGplayer: ${s.name}`,
      body: `${s.lang === 'JP' ? 'Japanese' : 'English'} set, listed for ${s.released}.${lines.length ? ` Pre-sale: ${lines.join('; ')}.` : ''}`,
      tags: ['sparkles', 'eyes'],
      priority: 3,
      click: link('/drops'),
      to: 'all',
    })
  }
  return { alerts, newGroups }
}

function presaleLines(ctx: AlertContext, prices: Prices, set: SetInfo, products: Product[], today: string, max: number): string[] {
  const rows: Array<{ text: string; market: number }> = []
  for (const p of products) {
    if (!p.presale || (p.released ?? set.released) < today) continue
    const v = prices.view(p.id)
    if (!v || v.market == null) continue
    const m = msrpFor(ctx.msrp, { id: p.id, sealed: p.sealed, released: p.released ?? set.released }, set.lang)
    const premium = m?.solid ? ` (${v.market >= m.value ? '+' : '−'}${pctText(v.market / m.value - 1)} vs MSRP)` : ''
    rows.push({ text: `${p.name.replace(set.name.replace(/^[A-Za-z]+\d*(\.\d+)?:\s*/, ''), '').trim() || p.name} ${usd(v.market)}${premium}`, market: v.market })
  }
  return rows.sort((a, b) => b.market - a.market).slice(0, max).map((r) => r.text)
}

/** Pre-sale sealed products that got a price since the last snapshot, in sets that are not themselves brand new. */
export function presaleAlerts(ctx: AlertContext, prices: Prices, today: string, newGroups: Set<number>): Alert[] {
  if (!prices.latest || !prices.previous) return []
  const before = new Set(Object.keys(prices.previous.prices).map((k) => Number(k.slice(0, k.indexOf(':')))))
  const fresh = new Map<number, Product[]>()
  for (const [id, p] of ctx.products) {
    if (p.kind !== 'sealed' || !p.presale || p.sealed === 'case' || newGroups.has(p.set) || before.has(id) || !prices.view(id)) continue
    const list = fresh.get(p.set)
    if (list) list.push(p)
    else fresh.set(p.set, [p])
  }
  const out: Alert[] = []
  for (const [setId, products] of fresh) {
    const set = ctx.sets.find((s) => s.id === setId)
    if (!set) continue
    const lines = presaleLines(ctx, prices, set, products, today, 3)
    if (!lines.length) continue
    out.push({
      key: `presale:${setId}:${prices.latest.date}`,
      kind: 'new-presale',
      title: `${products.length} new pre-order ${products.length === 1 ? 'listing' : 'listings'}: ${set.name}`,
      body: `${lines.join('; ')}.`,
      tags: ['package', 'eyes'],
      priority: 3,
      click: link('/drops'),
      to: 'all',
    })
  }
  return out
}

/** A predicted Pokémon Center pre-order window that starts within a week (or has started). Labeled as a prediction. */
export function preorderWindowAlerts(ctx: AlertContext, today: string): Alert[] {
  const out: Alert[] = []
  for (const r of ctx.releases) {
    const p = r.preorderPrediction
    if (!p || r.preorder || p.to < today || daysBetween(today, p.from) > 7) continue
    out.push({
      key: `preorder-window:${r.id}:${p.from}`,
      kind: 'preorder-window',
      title: `${shortName(r.name)} pre-orders may open this week (predicted)`,
      body: `A prediction, not an announcement: ${p.basis}. Window ${p.from} to ${p.to}, most likely ${WEEKDAYS[weekdayOf(p.likely)].replace(/s$/, '')} ${p.likely}.`,
      tags: ['crystal_ball', 'calendar'],
      priority: 3,
      click: link('/drops'),
      to: 'all',
    })
  }
  return out
}

/** The evening before a release, a prerelease or a pre-order date (US Eastern), when it is easiest to act on. */
export const EVENING_HOUR = 17

export function tomorrowAlerts(ctx: AlertContext): Alert[] {
  const et = easternNow(ctx.now)
  if (et.hour < EVENING_HOUR) return []
  const tomorrow = addDays(et.date, 1)
  const out: Alert[] = []
  for (const r of ctx.releases) {
    if (r.region === 'JP' && r.kind === 'product') continue
    const name = shortName(r.name)
    if (r.date === tomorrow) {
      out.push({
        key: `release:${r.id}:${r.date}`,
        kind: 'release-tomorrow',
        title: `${name} comes out tomorrow${r.region === 'JP' ? ' (Japan)' : ''}`,
        body: [r.confidence === 'low' ? 'The date is a rumor.' : '', r.dateNote].filter(Boolean).join(' ') || 'Check stores and Pokémon Center in the morning.',
        tags: ['tada', 'calendar'],
        priority: 3,
        click: link('/drops'),
        to: 'all',
      })
    }
    if (r.prerelease?.start === tomorrow) {
      out.push({
        key: `prerelease:${r.id}:${r.prerelease.start}`,
        kind: 'prerelease-tomorrow',
        title: `${name} prerelease starts tomorrow`,
        body: `Prerelease events run ${r.prerelease.start} to ${r.prerelease.end}. Find a local store on the Hunt tab.`,
        tags: ['tada', 'calendar'],
        priority: 3,
        click: link('/drops'),
        to: 'all',
      })
    }
    if (r.preorder?.date === tomorrow) {
      out.push({
        key: `preorder-open:${r.id}:${r.preorder.date}`,
        kind: 'preorder-tomorrow',
        title: `${name} pre-orders open tomorrow${r.preorder.where ? ` at ${r.preorder.where}` : ''}`,
        body: r.preorder.note ?? 'Be ready before it opens.',
        tags: ['alarm_clock', 'calendar'],
        priority: 3,
        click: link('/drops'),
        to: 'all',
      })
    }
  }
  return out
}

// ---------- news ----------

/** Fresh news only; the puller's "first seen" time can lag the post by a run or two. */
const NEWS_FRESH_MS = 6 * HOUR
export const NEWS_PER_RUN = 3

export function newsAlerts(ctx: AlertContext): Alert[] {
  const watchers = (hits: NonNullable<NewsItem['watch']>) => {
    const ids = new Set(hits.map((h) => h.id))
    const people = new Set<string>()
    for (const r of interest(ctx)) if (ids.has(r.productId) && r.source !== 'sold') people.add(r.person)
    return [...people]
  }
  const ranked: Array<{ rank: number; item: NewsItem; alert: Alert }> = []
  for (const item of ctx.news) {
    if (ctx.now - Date.parse(item.date) > NEWS_FRESH_MS || Date.parse(item.date) > ctx.now + HOUR) continue
    const tags = item.tags
    const product = (item.watch ?? []).filter((w) => w.level === 'product')
    const setLevel = (item.watch ?? []).filter((w) => w.level === 'set')
    const category = tags.some((t) => ['price-error', 'drawing', 'restock', 'preorder', 'deal'].includes(t))
    const hits = product.length ? product : category ? setLevel : []
    const rank = tags.includes('price-error') ? 0 : hits.length ? 1 : tags.includes('drawing') ? 2 : tags.includes('restock') ? 3 : -1
    if (rank < 0) continue
    const source = ctx.newsSources[item.source]?.name ?? item.source
    const who = hits.length ? watchers(hits) : []
    ranked.push({
      rank,
      item,
      alert: {
        key: `news:${item.id}`,
        kind: 'news-hit',
        title: clip(item.title, 90),
        body: [source, ...tags.map((t) => TAG_LABEL[t] ?? t), hits.length ? `mentions ${hits.map((h) => h.name).slice(0, 2).join(', ')} from your watchlist` : '', item.summary && !item.source.startsWith('reddit') ? clip(item.summary, 110) : ''].filter(Boolean).join(' · '),
        tags: [tags.includes('price-error') ? 'rotating_light' : tags.includes('drawing') ? 'ticket' : hits.length ? 'eyes' : 'newspaper', ...(tags.includes('price-error') ? ['moneybag'] : [])],
        priority: tags.includes('price-error') ? 4 : 3,
        click: item.link,
        action: { label: 'Open Drops', url: link('/drops') },
        to: who.length ? who : 'all',
      },
    })
  }
  ranked.sort((a, b) => a.rank - b.rank || (a.item.date < b.item.date ? 1 : a.item.date > b.item.date ? -1 : 0))
  return ranked.slice(0, NEWS_PER_RUN).map((r) => r.alert)
}

// ---------- everything ----------

export function evaluateAll(ctx: AlertContext): Alert[] {
  const prices = makePrices(ctx.snapshots)
  const today = easternNow(ctx.now).date
  // "New" is judged against the data's own day (snapshots are dated by TCGCSV's clock).
  const dataDay = prices.latest?.date ?? today
  const targets = targetAlerts(ctx, prices)
  const taken = new Set(targets.map((a) => a.key))
  const groups = groupAlerts(ctx, prices, dataDay)
  return [
    ...drawingAlerts(ctx),
    ...dropAlerts(ctx),
    ...newsAlerts(ctx),
    ...recurringAlerts(ctx),
    ...targets,
    ...listingAlerts(ctx, prices, taken),
    ...moveAlerts(ctx, prices),
    ...postAlerts(ctx),
    ...groups.alerts,
    ...presaleAlerts(ctx, prices, dataDay, groups.newGroups),
    ...preorderWindowAlerts(ctx, today),
    ...tomorrowAlerts(ctx),
  ]
}

// ---------- log, dedupe, cap ----------

/** Drops what was already sent (a still-true price target may go again after its repeat window). */
export function dedupe(alerts: Alert[], log: AlertLogEntry[], now: number): Alert[] {
  const last = new Map<string, number>()
  for (const e of log) last.set(e.key, Math.max(last.get(e.key) ?? 0, Date.parse(e.at)))
  const seen = new Set<string>()
  return alerts.filter((a) => {
    if (seen.has(a.key)) return false
    seen.add(a.key)
    const at = last.get(a.key)
    if (at == null) return true
    return a.repeatDays != null && now - at >= a.repeatDays * DAY
  })
}

export function pruneLog(log: AlertLogEntry[], now: number): AlertLogEntry[] {
  return log.filter((e) => now - Date.parse(e.at) <= LOG_DAYS * DAY)
}

const KIND_ORDER = ['drawing-closing', 'drop-live', 'weekly-event', 'news-hit', 'watch-target', 'sell-target', 'listing-deal', 'big-move', 'board-post', 'new-group', 'new-presale', 'preorder-window', 'release-tomorrow', 'prerelease-tomorrow', 'preorder-tomorrow']

export function sortAlerts(alerts: Alert[]): Alert[] {
  const rank = (a: Alert) => (KIND_ORDER.indexOf(a.kind) + 1 || KIND_ORDER.length + 1)
  return [...alerts].sort((a, b) => b.priority - a.priority || rank(a) - rank(b))
}

export interface Capped {
  send: Alert[]
  /** Sent inside one "and N more" summary. */
  folded: Alert[]
  summary?: Alert
}

/** At most `max` pushes: the best ones alone, the rest folded into one summary. */
export function capAlerts(alerts: Alert[], max = MAX_PUSHES): Capped {
  const sorted = sortAlerts(alerts)
  if (sorted.length <= max) return { send: sorted, folded: [] }
  const send = sorted.slice(0, max - 1)
  const folded = sorted.slice(max - 1)
  const everyone = folded.some((a) => a.to === 'all')
  const people = [...new Set(folded.flatMap((a) => (a.to === 'all' ? [] : a.to)))]
  const lines = folded.slice(0, 6).map((a) => `• ${clip(a.title, 80)}`)
  const summary: Alert = {
    key: `summary:${folded.map((a) => a.key).join('|').slice(0, 120)}`,
    kind: 'summary',
    title: `${folded.length} more alerts`,
    body: lines.join('\n') + (folded.length > 6 ? `\n…and ${folded.length - 6} more` : ''),
    tags: ['bell'],
    priority: 3,
    click: link('/drops'),
    to: everyone ? 'all' : people,
  }
  return { send, folded, summary }
}

// ---------- delivery ----------

export type Topics = { mode: 'none' } | { mode: 'shared'; topic: string } | { mode: 'per-person'; byPerson: Record<string, string> }

/** NTFY_TOPIC is either one shared topic ("abc123") or one per person ("alex=abc1,cousin=abc2"). */
export function parseTopics(raw: string | undefined): Topics {
  const value = (raw ?? '').trim()
  if (!value) return { mode: 'none' }
  if (!value.includes('=')) return { mode: 'shared', topic: value }
  const byPerson: Record<string, string> = {}
  for (const part of value.split(',')) {
    const [id, topic] = part.split('=').map((s) => s.trim())
    if (id && topic) byPerson[id.toLowerCase()] = topic
  }
  return Object.keys(byPerson).length ? { mode: 'per-person', byPerson } : { mode: 'none' }
}

/** The topics one alert goes to, de-duplicated. */
export function topicsFor(alert: Pick<Alert, 'to'>, topics: Topics, people: Person[]): string[] {
  if (topics.mode === 'none') return []
  if (topics.mode === 'shared') return [topics.topic]
  const ids = alert.to === 'all' ? [...new Set([...people.map((p) => p.id), ...Object.keys(topics.byPerson)])] : alert.to
  return [...new Set(ids.map((id) => topics.byPerson[id.toLowerCase()]).filter((t): t is string => !!t))]
}

/** The body for ntfy's JSON publish API (UTF-8 safe, unlike header-based publishing). */
export function ntfyPayload(alert: Alert, topic: string, topics: Topics, people: Person[]): Record<string, unknown> {
  // With one shared topic everyone sees everything, so say whom a personal alert is for.
  const forWho = topics.mode === 'shared' && alert.to !== 'all' && alert.to.length < people.length ? `${alert.to.map((id) => people.find((p) => p.id === id)?.name ?? id).join(' & ')}: ` : ''
  return {
    topic,
    title: `${forWho}${alert.title}`,
    message: alert.body,
    tags: alert.tags,
    priority: alert.priority,
    click: alert.click,
    ...(alert.action ? { actions: [{ action: 'view', label: alert.action.label, url: alert.action.url, clear: true }] } : {}),
  }
}

export function toLogEntry(alert: Alert, at: string, folded = false): AlertLogEntry {
  return { key: alert.key, kind: alert.kind, at, title: alert.title, body: alert.body, click: alert.click, to: alert.to, priority: alert.priority, ...(folded ? { folded: true } : {}) }
}
