// Radar's "needs you now" list: everything time-sensitive or actionable, ranked by urgency.
// Pure so it can be tested; the page feeds it the user files and current prices.
import { nextOccurrence } from './recurring.ts'
import type { Post, Recurring, WatchItem } from './user.ts'

export type AttentionKind = 'drawing' | 'drop' | 'deal' | 'weekly' | 'target' | 'sell' | 'under' | 'post'

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
}): Attention[] {
  const { posts, recurring, watch, prices, me, now, lastSeen } = input
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

  return out.sort((a, b) => b.urgency - a.urgency)
}
