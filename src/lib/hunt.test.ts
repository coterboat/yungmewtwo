import { describe, expect, it } from 'vitest'
import {
  PRIOR_MEAN,
  bestWindow,
  blockOfHour,
  buildGrid,
  buildModels,
  confidence,
  hadStock,
  recencyWeight,
  stockScore,
  storeStatus,
  todaysBets,
  upcomingBlocks,
  whenParts,
  windowLabel,
} from './hunt.ts'
import type { Sighting, SightingResult, Store } from './user.ts'

// Wed 2026-10-14 11:00 America/New_York (EDT, UTC-4).
const NOW = Date.UTC(2026, 9, 14, 15, 0)
const DAY = 86_400_000

let seq = 0
/** A sighting `daysAgo` days before NOW at the given ET wall-clock hour (default 9am). */
function sight(store: string, result: SightingResult, daysAgo: number, hourEt = 9, by = 'alex'): Sighting {
  const day = new Date(NOW - daysAgo * DAY)
  const at = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hourEt + 4, 0)).toISOString()
  return { id: `s${seq++}`, store, by, at, result }
}

const store = (id: string, chain = 'Target', dist = { alex: 3 } as Record<string, number>): Store => ({ id, chain, name: `${chain} ${id}`, lat: 33.9, lng: -84.3, dist, source: 'osm' })

describe('time blocks', () => {
  it('splits the day into morning, midday, afternoon, evening', () => {
    expect([5, 9, 10, 11, 13, 14, 17, 18, 22].map(blockOfHour)).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3])
  })
  it('reads weekday and block in the stores time zone, not the viewers', () => {
    expect(whenParts(NOW)).toMatchObject({ weekday: 3, hour: 11, block: 1 })
    // 02:30 UTC on Oct 15 is still Wednesday 10:30pm in Atlanta.
    expect(whenParts(Date.UTC(2026, 9, 15, 2, 30))).toMatchObject({ weekday: 3, hour: 22, block: 3 })
  })
  it('names a window', () => {
    expect(windowLabel(3, 0)).toBe('Wed mornings')
    expect(windowLabel(5, 2)).toBe('Fri afternoons')
    expect(windowLabel(0, 1)).toBe('Sun midday')
  })
})

describe('scoring', () => {
  it('counts empty as a miss and everything else as some stock', () => {
    expect(stockScore('stocked')).toBe(1)
    expect(stockScore('restocking')).toBe(1)
    expect(stockScore('limited')).toBeGreaterThan(0)
    expect(stockScore('limited')).toBeLessThan(1)
    expect(stockScore('empty')).toBe(0)
    expect(hadStock('limited')).toBe(true)
    expect(hadStock('empty')).toBe(false)
  })
  it('decays older sightings but never to nothing', () => {
    expect(recencyWeight(0)).toBe(1)
    expect(recencyWeight(60)).toBeCloseTo(0.5, 5)
    expect(recencyWeight(-3)).toBe(1)
    expect(recencyWeight(5000)).toBeGreaterThanOrEqual(0.1)
  })
})

describe('buildGrid', () => {
  const wedMornings = [sight('a', 'stocked', 7), sight('a', 'stocked', 14), sight('a', 'stocked', 21), sight('a', 'empty', 28)]
  it('counts raw visits per weekday and block', () => {
    const g = buildGrid(wedMornings, NOW)
    expect(g.cells[3][0]).toMatchObject({ n: 4, hits: 3 })
    expect(g.cells[3][1].n).toBe(0)
    expect(g.weekdays[3]).toMatchObject({ n: 4, hits: 3 })
    expect(g.blocks[0]).toMatchObject({ n: 4, hits: 3 })
    expect(g.all).toMatchObject({ n: 4, hits: 3 })
  })
  it('smooths: one stocked visit is not a sure thing, an empty cell sits at the prior', () => {
    const one = buildGrid([sight('a', 'stocked', 1)], NOW)
    const d = whenParts(Date.parse(sight('a', 'stocked', 1).at)).weekday
    expect(one.cells[d][0].mean).toBeGreaterThan(PRIOR_MEAN)
    expect(one.cells[d][0].mean).toBeLessThan(0.75)
    expect(one.cells[(d + 1) % 7][3].mean).toBeCloseTo(PRIOR_MEAN, 5)
  })
  it('pulls toward a parent grid when the cell has little data', () => {
    const parent = buildGrid(Array.from({ length: 10 }, (_, i) => sight('x', 'stocked', i * 7 + 1)), NOW)
    const child = buildGrid([sight('a', 'empty', 1)], NOW, { prior: parent })
    const lone = buildGrid([sight('a', 'empty', 1)], NOW)
    expect(child.all.mean).toBeGreaterThan(lone.all.mean)
  })
  it('weights recent visits above old ones', () => {
    const recentStock = buildGrid([sight('a', 'stocked', 7), sight('a', 'empty', 399)], NOW).cells[3][0].mean
    const oldStock = buildGrid([sight('a', 'stocked', 399), sight('a', 'empty', 7)], NOW).cells[3][0].mean
    expect(recentStock).toBeGreaterThan(oldStock)
  })
})

describe('bestWindow and confidence', () => {
  it('needs two visits and a hit in a window before it calls one best', () => {
    expect(bestWindow(buildGrid([sight('a', 'stocked', 7)], NOW))).toBeNull()
    expect(bestWindow(buildGrid([sight('a', 'empty', 7), sight('a', 'empty', 14)], NOW))).toBeNull()
  })
  it('picks the strongest window and reports its raw sample', () => {
    const sightings = [
      sight('a', 'stocked', 7),
      sight('a', 'stocked', 14),
      sight('a', 'stocked', 21),
      sight('a', 'empty', 28),
      sight('a', 'empty', 6, 15), // Tue afternoon, empty
      sight('a', 'empty', 13, 15),
    ]
    const w = bestWindow(buildGrid(sightings, NOW))
    expect(w).toMatchObject({ weekday: 3, block: 0, label: 'Wed mornings', n: 4, hits: 3 })
  })
  it('labels confidence by sample size', () => {
    expect(confidence(0).level).toBe('none')
    expect(confidence(2).level).toBe('hunch')
    expect(confidence(3).level).toBe('early')
    expect(confidence(6).level).toBe('fair')
    expect(confidence(12).level).toBe('solid')
    expect(confidence(2).label.toLowerCase()).toContain('hunch')
  })
})

describe('storeStatus', () => {
  it('finds the last stocked visit and the current streak', () => {
    const list = [sight('a', 'stocked', 20), sight('a', 'empty', 10), sight('a', 'empty', 5), sight('a', 'empty', 1)]
    const s = storeStatus(list)
    expect(s.n).toBe(4)
    expect(s.hits).toBe(1)
    expect(s.lastStocked?.id).toBe(list[0].id)
    expect(s.streak).toEqual({ kind: 'empty', count: 3 })
  })
  it('counts a stocked streak and remembers when a restock was caught live', () => {
    const list = [sight('a', 'empty', 9), sight('a', 'restocking', 4), sight('a', 'stocked', 2), sight('a', 'limited', 1)]
    const s = storeStatus(list)
    expect(s.streak).toEqual({ kind: 'stock', count: 3 })
    expect(s.lastRestock?.id).toBe(list[1].id)
    expect(s.last?.id).toBe(list[3].id)
  })
  it('handles no visits', () => {
    const s = storeStatus([])
    expect(s).toMatchObject({ n: 0, hits: 0 })
    expect(s.streak).toBeUndefined()
    expect(s.last).toBeUndefined()
  })
})

describe('upcomingBlocks', () => {
  it('lists the current and later blocks today', () => {
    expect(upcomingBlocks(NOW)).toEqual([
      { weekday: 3, block: 1, dayOffset: 0, now: true },
      { weekday: 3, block: 2, dayOffset: 0, now: false },
      { weekday: 3, block: 3, dayOffset: 0, now: false },
    ])
  })
  it('rolls over to tomorrow late at night', () => {
    const late = Date.UTC(2026, 9, 15, 2, 30) // Wed 10:30pm ET
    const blocks = upcomingBlocks(late)
    expect(blocks[0]).toMatchObject({ weekday: 4, block: 0, dayOffset: 1 })
    expect(blocks).toHaveLength(4)
  })
})

describe('todaysBets', () => {
  const stores = [store('wed', 'Target', { alex: 6 }), store('other', 'Target', { alex: 2 }), store('fresh', 'Walmart', { alex: 1 })]
  // 'wed' is reliably stocked on Wednesday mornings; 'other' only ever empty on Wednesdays.
  const base = [...[7, 14, 21, 28].map((d) => sight('wed', 'stocked', d, 9)), ...[7, 14, 21].map((d) => sight('other', 'empty', d, 9))]
  const MORNING = NOW - 2 * 3_600_000 // 9am
  const distOf = (s: Store) => s.dist.alex

  it('ranks the store with the learned pattern first and flags thin evidence', () => {
    const models = buildModels(stores, base, MORNING)
    const bets = todaysBets(stores, base, models, MORNING, distOf)
    expect(bets[0].store.id).toBe('wed')
    expect(bets[0].basis).toBe('store')
    expect(bets[0].slot.block).toBe(0)
    expect(bets[0].score).toBeGreaterThan(bets.find((b) => b.store.id === 'other')!.score)
  })
  it('lets a fresh sighting beat the pattern', () => {
    const emptyNow = [...base, { ...sight('wed', 'empty', 0, 9), at: new Date(MORNING - 20 * 60_000).toISOString() }]
    const models = buildModels(stores, emptyNow, MORNING)
    const bets = todaysBets(stores, emptyNow, models, MORNING, distOf)
    const wed = bets.find((b) => b.store.id === 'wed')!
    expect(wed.live?.kind).toBe('empty')
    expect(wed.score).toBeLessThan(0.5)

    const stockedNow = [...base, { ...sight('other', 'stocked', 0, 9), at: new Date(MORNING - 30 * 60_000).toISOString() }]
    const m2 = buildModels(stores, stockedNow, MORNING)
    const other = todaysBets(stores, stockedNow, m2, MORNING, distOf).find((b) => b.store.id === 'other')!
    expect(other.live?.kind).toBe('stock')
    expect(other.score).toBeGreaterThanOrEqual(0.85)
  })
  it('marks stores with no data at all as prior-only', () => {
    const models = buildModels(stores, base, MORNING)
    const bets = todaysBets(stores, base, models, MORNING, distOf)
    expect(bets.find((b) => b.store.id === 'fresh')!.basis).toBe('prior')
  })
  it('does not call two chain-wide visits a pattern', () => {
    const two = [sight('wed', 'stocked', 7, 9), sight('wed', 'stocked', 14, 9)]
    const models = buildModels(stores, two, MORNING)
    const bets = todaysBets(stores, two, models, MORNING, distOf)
    expect(bets.find((b) => b.store.id === 'other')!.basis).toBe('prior')
  })
  it('borrows the chain pattern for a store with no visits of its own', () => {
    const all = [...stores, store('t3', 'Target', { alex: 9 })]
    const models = buildModels(all, base, MORNING)
    const bets = todaysBets(all, base, models, MORNING, distOf)
    expect(bets.find((b) => b.store.id === 't3')!.basis).toBe('chain')
  })
})
