import { describe, expect, it } from 'vitest'
import {
  commitMessage,
  countByType,
  dropPhase,
  filterPosts,
  formatCountdown,
  formatRange,
  isPast,
  isUrgent,
  nextStatus,
  scopeCounts,
  sortPosts,
  statusOptions,
  timeLeft,
} from './board.ts'
import type { Post } from './user.ts'

const NOW = Date.parse('2026-10-14T18:00:00Z')
const h = (n: number) => new Date(NOW + n * 3_600_000).toISOString()

const post = (over: Partial<Post>): Post => ({ id: 'x', type: 'note', by: 'alex', at: h(-1), title: 't', ...over })

describe('formatCountdown', () => {
  it('shows days and hours, then hours and minutes, then minutes and seconds', () => {
    expect(formatCountdown(3 * 86_400_000 + 4 * 3_600_000 + 5 * 60_000)).toBe('3d 4h')
    expect(formatCountdown(2 * 3_600_000 + 14 * 60_000 + 59_000)).toBe('2h 14m')
    expect(formatCountdown(14 * 60_000 + 5_000)).toBe('14m 05s')
    expect(formatCountdown(42_000)).toBe('0m 42s')
  })
  it('says closed at or below zero', () => {
    expect(formatCountdown(0)).toBe('closed')
    expect(formatCountdown(-5)).toBe('closed')
  })
})

describe('isPast', () => {
  it('treats archived posts as past', () => {
    expect(isPast(post({ archived: true }), NOW)).toBe(true)
  })
  it('closes drawings and deals when their end passes', () => {
    expect(isPast(post({ type: 'drawing', ends: h(-1) }), NOW)).toBe(true)
    expect(isPast(post({ type: 'drawing', ends: h(1) }), NOW)).toBe(false)
    expect(isPast(post({ type: 'deal', ends: h(-0.1) }), NOW)).toBe(true)
    expect(isPast(post({ type: 'deal' }), NOW)).toBe(false)
  })
  it('keeps a drop open for two hours after it goes live', () => {
    expect(isPast(post({ type: 'drop', starts: h(-1) }), NOW)).toBe(false)
    expect(isPast(post({ type: 'drop', starts: h(-3) }), NOW)).toBe(true)
  })
  it('keeps an event open through its end, or three hours after its start', () => {
    expect(isPast(post({ type: 'event', starts: h(-2) }), NOW)).toBe(false)
    expect(isPast(post({ type: 'event', starts: h(-4) }), NOW)).toBe(true)
    expect(isPast(post({ type: 'event', starts: h(-4), ends: h(1) }), NOW)).toBe(false)
  })
  it('never expires notes on its own', () => {
    expect(isPast(post({ at: h(-5000) }), NOW)).toBe(false)
  })
})

describe('timeLeft / isUrgent', () => {
  it('measures time to the deadline', () => {
    expect(timeLeft(post({ type: 'drawing', ends: h(2) }), NOW)).toBe(2 * 3_600_000)
    expect(timeLeft(post({ type: 'note' }), NOW)).toBeUndefined()
  })
  it('flags drawings with under three hours left', () => {
    expect(isUrgent(post({ type: 'drawing', ends: h(2.9) }), NOW)).toBe(true)
    expect(isUrgent(post({ type: 'drawing', ends: h(3.1) }), NOW)).toBe(false)
    expect(isUrgent(post({ type: 'drawing', ends: h(-1) }), NOW)).toBe(false)
    expect(isUrgent(post({ type: 'drawing', ends: h(1), archived: true }), NOW)).toBe(false)
  })
})

describe('dropPhase', () => {
  it('goes upcoming, live, then over', () => {
    expect(dropPhase(post({ type: 'drop', starts: h(1) }), NOW)).toBe('upcoming')
    expect(dropPhase(post({ type: 'drop', starts: h(-1) }), NOW)).toBe('live')
    expect(dropPhase(post({ type: 'drop', starts: h(-3) }), NOW)).toBe('over')
  })
})

describe('sortPosts', () => {
  const a = post({ id: 'a', type: 'drawing', ends: h(30), at: h(-10) })
  const b = post({ id: 'b', type: 'drawing', ends: h(2), at: h(-20) })
  const c = post({ id: 'c', type: 'note', at: h(-1) })
  const d = post({ id: 'd', type: 'deal', at: h(-5) })
  const e = post({ id: 'e', type: 'drop', starts: h(-1), at: h(-30) })
  it('puts live things first, then soonest deadline, then newest', () => {
    expect(sortPosts([c, a, d, b, e], NOW, 'open').map((p) => p.id)).toEqual(['e', 'b', 'a', 'c', 'd'])
  })
  it('lists past posts by most recently closed', () => {
    const old = post({ id: 'old', type: 'drawing', ends: h(-48), at: h(-100) })
    const recent = post({ id: 'recent', type: 'drawing', ends: h(-2), at: h(-90) })
    const arch = post({ id: 'arch', archived: true, at: h(-10) })
    expect(sortPosts([old, arch, recent], NOW, 'past').map((p) => p.id)).toEqual(['recent', 'arch', 'old'])
  })
  it('does not mutate its input', () => {
    const input = [c, a]
    sortPosts(input, NOW, 'open')
    expect(input.map((p) => p.id)).toEqual(['c', 'a'])
  })
})

describe('filters and counts', () => {
  const posts = [
    post({ id: '1', type: 'deal' }),
    post({ id: '2', type: 'deal', archived: true }),
    post({ id: '3', type: 'drawing', ends: h(5) }),
    post({ id: '4', type: 'drawing', ends: h(-5) }),
    post({ id: '5', type: 'note' }),
  ]
  it('splits open and past', () => {
    expect(scopeCounts(posts, NOW)).toEqual({ open: 3, past: 2 })
  })
  it('filters by type and scope', () => {
    expect(filterPosts(posts, 'deal', 'open', NOW).map((p) => p.id)).toEqual(['1'])
    expect(filterPosts(posts, 'all', 'past', NOW).map((p) => p.id)).toEqual(['2', '4'])
  })
  it('counts per type within a scope', () => {
    expect(countByType(posts, 'open', NOW)).toEqual({ all: 3, deal: 1, drawing: 1, drop: 0, event: 0, note: 1 })
  })
})

describe('statuses', () => {
  it('offers the right choices per type', () => {
    expect(statusOptions('deal').map((o) => o.value)).toEqual(['got', 'skip'])
    expect(statusOptions('drawing').map((o) => o.value)).toEqual(['in', 'won', 'lost', 'skip'])
    expect(statusOptions('note')).toEqual([])
  })
  it('sets and toggles one person without touching the other', () => {
    const p = post({ type: 'drawing', status: { paul: 'in' } })
    const set = nextStatus(p, 'alex', 'in')
    expect(set.status).toEqual({ paul: 'in', alex: 'in' })
    expect(nextStatus(set, 'alex', 'in').status).toEqual({ paul: 'in' })
    expect(nextStatus(set, 'alex', 'won').status).toEqual({ paul: 'in', alex: 'won' })
    expect(p.status).toEqual({ paul: 'in' })
  })
  it('drops the status object when it empties', () => {
    const p = post({ type: 'deal', status: { alex: 'got' } })
    expect(nextStatus(p, 'alex', 'got').status).toBeUndefined()
  })
})

describe('commitMessage', () => {
  it('names the person, the type and the title', () => {
    expect(commitMessage('posted', 'Alex', post({ type: 'deal', title: 'ETB at Target' }))).toBe('board: Alex posted a deal: ETB at Target')
    expect(commitMessage('posted', 'Sam', post({ type: 'event', title: 'League night' }))).toBe('board: Sam posted an event: League night')
  })
  it('covers the other actions', () => {
    const p = post({ type: 'drawing', title: 'Wed drawing' })
    expect(commitMessage('archived', 'Alex', p)).toBe('board: Alex archived a drawing: Wed drawing')
    expect(commitMessage('deleted', 'Alex', p)).toBe('board: Alex deleted a drawing: Wed drawing')
    expect(commitMessage('edited', 'Alex', p)).toBe('board: Alex edited a drawing: Wed drawing')
    expect(commitMessage('responded', 'Alex', p)).toBe('board: Alex updated their status on a drawing: Wed drawing')
  })
  it('keeps long titles out of the commit subject', () => {
    const long = 'x'.repeat(200)
    expect(commitMessage('posted', 'A', post({ type: 'note', title: long })).length).toBeLessThan(120)
  })
})

describe('formatRange', () => {
  const at = (h: number, m = 0, day = 18) => new Date(2026, 9, day, h, m).toISOString()
  const now = new Date(2026, 9, 14).getTime()
  it('shows a single time when there is no end', () => {
    expect(formatRange(at(13), undefined, now)).toBe('Sun, Oct 18 · 1:00 PM')
  })
  it('shares the date on a same-day range', () => {
    expect(formatRange(at(13), at(16, 30), now)).toBe('Sun, Oct 18 · 1:00 PM – 4:30 PM')
  })
  it('shows both dates when it spans days', () => {
    expect(formatRange(at(13), at(11, 0, 19), now)).toBe('Sun, Oct 18 · 1:00 PM → Mon, Oct 19 · 11:00 AM')
  })
})
