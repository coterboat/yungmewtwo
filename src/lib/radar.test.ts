import { describe, expect, it } from 'vitest'
import { buildAttention, type PriceInfo } from './radar.ts'
import type { Post, Recurring, WatchItem } from './user.ts'

const now = Date.parse('2026-10-14T20:00:00Z')
const base = { posts: [] as Post[], recurring: [] as Recurring[], watch: [] as WatchItem[], prices: new Map<number, PriceInfo>(), me: 'alex', now }

describe('buildAttention', () => {
  it('ranks a drawing closing in 1h above one closing in 2 days', () => {
    const posts: Post[] = [
      { id: 'a', type: 'drawing', by: 'paul', at: '2026-10-14T10:00:00Z', title: 'Later', ends: '2026-10-16T20:00:00Z' },
      { id: 'b', type: 'drawing', by: 'paul', at: '2026-10-14T10:00:00Z', title: 'Soon', ends: '2026-10-14T21:00:00Z' },
    ]
    const out = buildAttention({ ...base, posts })
    expect(out.map((x) => x.title)).toEqual(['Soon', 'Later'])
    expect(out[0].tone).toBe('holo')
  })
  it('demotes drawings I already entered and drops closed ones', () => {
    const posts: Post[] = [
      { id: 'a', type: 'drawing', by: 'paul', at: '', title: 'Entered', ends: '2026-10-14T21:00:00Z', status: { alex: 'in' } },
      { id: 'b', type: 'drawing', by: 'paul', at: '', title: 'Closed', ends: '2026-10-14T19:00:00Z' },
    ]
    const out = buildAttention({ ...base, posts })
    expect(out).toHaveLength(1)
    expect(out[0].urgency).toBeLessThan(30)
  })
  it('flags watch targets hit by market or by a listing, and sell lines', () => {
    const watch: WatchItem[] = [
      { id: 'w1', by: 'alex', productId: 1, target: 100, added: '' },
      { id: 'w2', by: 'alex', productId: 2, target: 50, added: '' },
      { id: 'w3', by: 'alex', productId: 3, above: 200, added: '' },
      { id: 'w4', by: 'paul', productId: 1, target: 100, added: '' },
    ]
    const prices = new Map<number, PriceInfo>([
      [1, { name: 'One', market: 95, low: 90 }],
      [2, { name: 'Two', market: 60, low: 48 }],
      [3, { name: 'Three', market: 210, low: 205 }],
    ])
    const kinds = buildAttention({ ...base, watch, prices }).map((x) => x.id)
    expect(kinds).toEqual(['target:w1', 'target-low:w2', 'sell:w3'])
  })
  it('shows weekly events within 30 hours and live ones as holo', () => {
    const recurring: Recurring[] = [{ id: 'wm', title: 'Walmart drawing', weekday: 3, time: '17:00', tz: 'America/New_York', durationMin: 60, enabled: true }]
    // 2026-10-14 is a Wednesday; 17:00 EDT = 21:00 UTC, one hour after `now`.
    const out = buildAttention({ ...base, recurring })
    expect(out[0].kind).toBe('weekly')
    expect(out[0].when).toBe('2026-10-14T21:00:00.000Z')
    const live = buildAttention({ ...base, recurring, now: Date.parse('2026-10-14T21:20:00Z') })
    expect(live[0].detail).toBe('Open now')
  })
  it("only surfaces other people's fresh deals", () => {
    const posts: Post[] = [
      { id: 'a', type: 'deal', by: 'alex', at: '2026-10-14T19:00:00Z', title: 'Mine' },
      { id: 'b', type: 'deal', by: 'paul', at: '2026-10-14T19:00:00Z', title: 'Fresh' },
      { id: 'c', type: 'deal', by: 'paul', at: '2026-10-10T19:00:00Z', title: 'Old' },
    ]
    expect(buildAttention({ ...base, posts, lastSeen: '2026-10-14T00:00:00Z' }).map((x) => x.title)).toEqual(['Fresh'])
  })
})

describe('buildAttention: news and releases', () => {
  it('surfaces a fresh drawing or price error from the news, not stale ones', () => {
    const news = [
      { id: 'n1', source: 'reddit', title: 'Walmart lottery live for the next hour!', link: 'https://x/1', date: '2026-10-14T19:30:00Z', seen: '', tags: ['drawing', 'walmart'] },
      { id: 'n2', source: 'reddit', title: 'Old drawing', link: 'https://x/2', date: '2026-10-14T10:00:00Z', seen: '', tags: ['drawing'] },
      { id: 'n3', source: 'reddit', title: 'Reveal', link: 'https://x/3', date: '2026-10-14T19:50:00Z', seen: '', tags: ['reveal'] },
    ]
    const out = buildAttention({ ...base, news })
    expect(out.map((x) => x.id)).toEqual(['news:n1'])
    expect(out[0].external).toBe(true)
  })
  it('flags release eve and an open predicted pre-order window', () => {
    const rel = (p: object) => ({ id: 'r', name: 'Set', region: 'EN', kind: 'main', date: null, confidence: 'high', origin: 'seed', prerelease: null, preorder: null, products: [], presale: false, ...p }) as never
    const out = buildAttention({
      ...base,
      releases: [
        rel({ id: 'a', name: 'Delta Reign', date: '2026-10-15' }),
        rel({ id: 'b', name: 'Next Set', date: '2026-11-25', preorderPrediction: { from: '2026-10-13', to: '2026-10-19', likely: '2026-10-14', basis: 'last 3 sets' } }),
      ],
    })
    expect(out.map((x) => x.id).sort()).toEqual(['preorder:b', 'release:a'])
  })
})
