// Radar's "needs you now" list: everything time-sensitive or actionable, ranked by urgency.
// Pure so it can be tested; the page feeds it the user files and current prices.
import { preorderStatus, type DropRelease } from './drops.ts'
import type { NewsItem } from './dropsNews.ts'
import { nextOccurrence } from './recurring.ts'
import type { Post, Recurring, WatchItem } from './user.ts'

export type AttentionKind = 'drawing' | 'drop' | 'deal' | 'weekly' | 'target' | 'sell' | 'under' | 'post' | 'news' | 'preorder' | 'release'

export interface Attention {
  id: string
  kind: AttentionKind
  title: string
  detail: string
  /** Deadline or start time (ISO), shown as a live countdown. */
  when?: string
  /** 0–100; higher sorts first. */
  urgency: number
  href: string
  /** Visual weight: holo = act now, warm = soon, calm = good to know. */
  tone: 'holo' | 'warm' | 'calm'
  productId?: number
  /** href is an outside link (news), opened in a new tab. */
  external?: boolean
}

export interface PriceInfo {
  name: string
  market: number | null
  low: number | null
}

const H = 3_600_000

export function buildAttention(input: {
  posts: Post[]
  recurring: Recurring[]
  watch: WatchItem[]
  prices: Map<number, PriceInfo>
  me: string | undefined
  now: number
  /** Posts newer than this (ISO) and not by me count as new. */
  lastSeen?: string
  news?: NewsItem[]
  releases?: DropRelease[]
}): Attention[] {
  const { posts, recurring, watch, prices, me, now, lastSeen, news = [], releases = [] } = input
  const out: Attention[] = []

  for (const p of posts) {
    if (p.archived) continue
    const mine = me ? p.status?.[me] : undefined
    if (p.type === 'drawing' && p.ends) {
      const left = (Date.parse(p.ends) - now) / H
      if (left <= 0 || left > 72) continue
      const done = mine === 'in' || mine === 'skip' || mine === 'won' || mine === 'lost'
      out.push({
        id: `drawing:${p.id}`,
        kind: 'drawing',
        title: done ? `${p.title} (you're in)` : p.title,
        detail: done ? `${p.store ?? 'Drawing'} closes soon` : `${p.store ?? 'Drawing'} · enter before it closes`,
        when: p.ends,
        urgency: done ? 15 : Math.max(45, 100 - left * 2),
        href: '/board',
        tone: !done && left < 3 ? 'holo' : done ? 'calm' : 'warm',
      })
    } else if (p.type === 'drop' && p.starts) {
      const until = (Date.parse(p.starts) - now) / H
      if (until < -2 || until > 48) continue
      out.push({
        id: `drop:${p.id}`,
        kind: 'drop',
        title: p.title,
        detail: until <= 0 ? `Live now${p.store ? ` at ${p.store}` : ''}` : `${p.store ?? 'Drop'} goes live`,
        when: p.starts,
        urgency: until <= 0 ? 95 : Math.max(40, 92 - until * 2),
        href: '/board',
        tone: until < 1 ? 'holo' : 'warm',
      })
    } else if (p.type === 'deal' && p.by !== me && !mine) {
      const fresh = !lastSeen || p.at > lastSeen
      const expiring = p.ends ? (Date.parse(p.ends) - now) / H : null
      if (expiring != null && expiring <= 0) continue
      if (!fresh && (expiring == null || expiring > 24)) continue
      out.push({
        id: `deal:${p.id}`,
        kind: 'deal',
        title: p.title,
        detail: [p.store, p.price != null ? `$${p.price}` : null].filter(Boolean).join(' · ') || 'New deal',
        when: p.ends,
        urgency: expiring != null && expiring < 24 ? 70 : 55,
        href: '/board',
        tone: 'warm',
        productId: p.productId,
      })
    } else if (p.by !== me && lastSeen && p.at > lastSeen && (p.type === 'event' || p.type === 'note')) {
      out.push({ id: `post:${p.id}`, kind: 'post', title: p.title, detail: 'New on the board', urgency: 30, href: '/board', tone: 'calm' })
    }
  }

  for (const r of recurring) {
    if (!r.enabled) continue
    const start = nextOccurrence(r, now).getTime()
    const until = (start - now) / H
    if (until > 30) continue
    const live = until <= 0
    out.push({
      id: `weekly:${r.id}`,
      kind: 'weekly',
      title: r.title,
      detail: live ? 'Open now' : 'Weekly',
      when: new Date(start).toISOString(),
      urgency: live ? 90 : Math.max(35, 80 - until * 2),
      href: '/hunt',
      tone: live || until < 1 ? 'holo' : 'warm',
    })
  }

  for (const w of watch) {
    if (me && w.by !== me) continue
    const p = prices.get(w.productId)
    if (!p) continue
    if (w.target != null && p.market != null && p.market <= w.target) {
      out.push({ id: `target:${w.id}`, kind: 'target', title: p.name, detail: `At $${p.market.toFixed(2)}, your target was $${w.target}`, urgency: 85, href: `/item/${w.productId}`, tone: 'holo', productId: w.productId })
    } else if (w.target != null && p.low != null && p.low <= w.target) {
      out.push({ id: `target-low:${w.id}`, kind: 'target', title: p.name, detail: `A listing at $${p.low.toFixed(2)} hits your $${w.target} target`, urgency: 78, href: `/item/${w.productId}`, tone: 'holo', productId: w.productId })
    } else if (p.market != null && p.low != null && p.market >= 10 && p.low <= p.market * 0.8) {
      out.push({ id: `under:${w.id}`, kind: 'under', title: p.name, detail: `Listing at $${p.low.toFixed(2)}, ${Math.round((1 - p.low / p.market) * 100)}% under market`, urgency: 60, href: `/item/${w.productId}`, tone: 'warm', productId: w.productId })
    }
    if (w.above != null && p.market != null && p.market >= w.above) {
      out.push({ id: `sell:${w.id}`, kind: 'sell', title: p.name, detail: `Up to $${p.market.toFixed(2)}, past your $${w.above} sell line`, urgency: 75, href: `/item/${w.productId}`, tone: 'holo', productId: w.productId })
    }
  }

  // Time-boxed news: a drawing or price error posted in the last couple of hours may still be live.
  for (const n of news) {
    const age = (now - Date.parse(n.date)) / H
    if (age < 0 || age > 2) continue
    const hot = n.tags.includes('price-error') || n.tags.includes('drawing')
    if (!hot && !n.watch?.length) continue
    out.push({
      id: `news:${n.id}`,
      kind: 'news',
      title: n.title,
      detail: n.watch?.length ? `Mentions ${n.watch[0].name} from your watchlist` : n.tags.includes('price-error') ? 'Possible price error, posted just now' : 'Posted just now, may still be open',
      urgency: n.tags.includes('price-error') ? 82 : 72,
      href: n.link,
      external: true,
      tone: age < 1 ? 'holo' : 'warm',
    })
  }

  // Releases: a predicted pre-order window that's open or about to be, and release/prerelease eve.
  const today = new Date(now).toISOString().slice(0, 10)
  const inDays = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / (24 * H))
  for (const r of releases) {
    if (r.region !== 'EN') continue
    const s = preorderStatus(r, today)
    if (s.state === 'predicted' && inDays(s.from) <= 3) {
      out.push({ id: `preorder:${r.id}`, kind: 'preorder', title: `${r.name} pre-orders`, detail: s.inWindow ? `Likely opening now (${s.basis})` : `Likely open from ${s.from} (${s.basis})`, urgency: s.inWindow ? 68 : 50, href: '/drops', tone: s.inWindow ? 'holo' : 'warm' })
    } else if (s.state === 'opens' && inDays(s.date) >= 0 && inDays(s.date) <= 1) {
      out.push({ id: `preorder:${r.id}`, kind: 'preorder', title: `${r.name} pre-orders open ${inDays(s.date) === 0 ? 'today' : 'tomorrow'}`, detail: s.where ?? 'Pre-orders', when: `${s.date}T00:00:00`, urgency: 74, href: '/drops', tone: 'holo' })
    }
    if (r.date && r.kind !== 'product' && inDays(r.date) >= 0 && inDays(r.date) <= 1) {
      out.push({ id: `release:${r.id}`, kind: 'release', title: `${r.name} releases ${inDays(r.date) === 0 ? 'today' : 'tomorrow'}`, detail: 'Stores and online restocks start dropping', urgency: 66, href: '/drops', tone: 'holo' })
    }
    if (r.prerelease && inDays(r.prerelease.start) >= 0 && inDays(r.prerelease.start) <= 1) {
      out.push({ id: `prerelease:${r.id}`, kind: 'release', title: `${r.name} prereleases start ${inDays(r.prerelease.start) === 0 ? 'today' : 'tomorrow'}`, detail: `Through ${r.prerelease.end} at local game stores`, urgency: 58, href: '/drops', tone: 'warm' })
    }
  }

  return out.sort((a, b) => b.urgency - a.urgency)
}
