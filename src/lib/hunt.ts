// The restock pattern learner. Every sighting says "at this store, on this weekday, around this
// time of day, there was stock (or not)". We pool those into a weekday x time-of-day grid per
// store and per chain, smooth each cell toward its parent (cell -> chain -> everyone) with a Beta
// prior so one lucky visit can't look like a schedule, and weight recent visits above old ones.
//
// Everything here is pure: no React, no network. Times are read in the stores' own zone
// (both of your areas are Eastern), so a pattern doesn't shift depending on where you're viewing.
import type { Sighting, SightingResult, Store } from './user.ts'

export const TZ = 'America/New_York'

/** Chance a random visit finds stock, before we know anything. Deliberately pessimistic. */
export const PRIOR_MEAN = 0.3
/** How many "virtual visits" the prior is worth. Higher = slower to trust the data. */
export const PRIOR_STRENGTH = 2
/** A sighting's weight halves every this many days. */
export const HALF_LIFE_DAYS = 60
const MIN_WEIGHT = 0.1
/** A sighting this fresh outranks any pattern. */
export const LIVE_WINDOW_MS = 4 * 3_600_000

// ---------- time ----------

export type Block = 0 | 1 | 2 | 3

export const BLOCKS: Array<{ id: 'morning' | 'midday' | 'afternoon' | 'evening'; label: string; range: string; plural: string }> = [
  { id: 'morning', label: 'Morning', range: 'before 11', plural: 'mornings' },
  { id: 'midday', label: 'Midday', range: '11 to 2', plural: 'midday' },
  { id: 'afternoon', label: 'Afternoon', range: '2 to 6', plural: 'afternoons' },
  { id: 'evening', label: 'Evening', range: 'after 6', plural: 'evenings' },
]

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function blockOfHour(hour: number): Block {
  return hour < 11 ? 0 : hour < 14 ? 1 : hour < 18 ? 2 : 3
}

const formatters = new Map<string, Intl.DateTimeFormat>()

export function whenParts(when: number | string, tz = TZ): { weekday: number; hour: number; block: Block } {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
    formatters.set(tz, f)
  }
  const ms = typeof when === 'number' ? when : Date.parse(when)
  const parts = f.formatToParts(new Date(ms))
  const weekday = WEEKDAYS_SHORT.indexOf(parts.find((p) => p.type === 'weekday')?.value ?? 'Sun')
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  return { weekday: Math.max(0, weekday), hour, block: blockOfHour(hour) }
}

/** "Wed mornings", "Fri afternoons", "Sun midday". */
export function windowLabel(weekday: number, block: number): string {
  return `${WEEKDAYS_SHORT[weekday]} ${BLOCKS[block].plural}`
}

// ---------- scoring ----------

/** How much stock a result means, 0 to 1. Limited counts as partial. */
export function stockScore(result: SightingResult): number {
  return result === 'empty' ? 0 : result === 'limited' ? 0.6 : 1
}

/** Anything but empty counts as "there was something". */
export function hadStock(result: SightingResult): boolean {
  return result !== 'empty'
}

export function recencyWeight(ageDays: number, halfLifeDays = HALF_LIFE_DAYS): number {
  if (ageDays <= 0) return 1
  return Math.max(MIN_WEIGHT, Math.pow(0.5, ageDays / halfLifeDays))
}

export interface Cell {
  /** Raw visits in this cell. */
  n: number
  /** Raw visits that found any stock. */
  hits: number
  /** Sum of recency weights. */
  w: number
  /** Sum of weight x stock score. */
  sum: number
  /** Smoothed chance of stock, 0 to 1. */
  mean: number
}

export interface PatternGrid {
  /** [weekday 0=Sun][block]. */
  cells: Cell[][]
  weekdays: Cell[]
  blocks: Cell[]
  all: Cell
}

interface BuildOptions {
  /** A parent grid to shrink toward, or a flat prior mean. */
  prior?: PatternGrid | number
  priorStrength?: number
  halfLifeDays?: number
  tz?: string
}

const blank = (): Cell => ({ n: 0, hits: 0, w: 0, sum: 0, mean: PRIOR_MEAN })

function settle(c: Cell, prior: number, k: number): Cell {
  c.mean = (k * prior + c.sum) / (k + c.w)
  return c
}

export function buildGrid(sightings: Sighting[], now: number, opts: BuildOptions = {}): PatternGrid {
  const k = opts.priorStrength ?? PRIOR_STRENGTH
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 4 }, blank))
  const weekdays = Array.from({ length: 7 }, blank)
  const blocks = Array.from({ length: 4 }, blank)
  const all = blank()

  for (const s of sightings) {
    const at = Date.parse(s.at)
    if (Number.isNaN(at)) continue
    const { weekday, block } = whenParts(at, opts.tz)
    const w = recencyWeight((now - at) / 86_400_000, opts.halfLifeDays)
    const score = stockScore(s.result)
    const hit = hadStock(s.result) ? 1 : 0
    for (const c of [cells[weekday][block], weekdays[weekday], blocks[block], all]) {
      c.n++
      c.hits += hit
      c.w += w
      c.sum += w * score
    }
  }

  const p = opts.prior
  const flat = typeof p === 'number' ? p : PRIOR_MEAN
  const parent = typeof p === 'object' ? p : undefined
  for (let d = 0; d < 7; d++) {
    for (let b = 0; b < 4; b++) settle(cells[d][b], parent ? parent.cells[d][b].mean : flat, k)
    settle(weekdays[d], parent ? parent.weekdays[d].mean : flat, k)
  }
  for (let b = 0; b < 4; b++) settle(blocks[b], parent ? parent.blocks[b].mean : flat, k)
  settle(all, parent ? parent.all.mean : flat, k)
  return { cells, weekdays, blocks, all }
}

// ---------- reading a grid ----------

export type ConfidenceLevel = 'none' | 'hunch' | 'early' | 'fair' | 'solid'

export function confidence(n: number): { level: ConfidenceLevel; label: string } {
  if (n <= 0) return { level: 'none', label: 'No visits yet' }
  if (n < 3) return { level: 'hunch', label: 'Just a hunch' }
  if (n < 6) return { level: 'early', label: 'Early read' }
  if (n < 12) return { level: 'fair', label: 'Fairly reliable' }
  return { level: 'solid', label: 'Solid' }
}

/** "3 of 4 visits" */
export function visitsText(hits: number, n: number): string {
  return `${hits} of ${n} ${n === 1 ? 'visit' : 'visits'}`
}

export interface Window {
  weekday: number
  block: Block
  label: string
  n: number
  hits: number
  mean: number
}

/** The weekday + time block that has most reliably had stock. Needs two visits in the window and
 *  stock on at least half of them; otherwise we say nothing rather than guess. */
export function bestWindow(grid: PatternGrid, minN = 2): Window | null {
  let best: Window | null = null
  for (let d = 0; d < 7; d++) {
    for (let b = 0; b < 4; b++) {
      const c = grid.cells[d][b]
      if (c.n < minN || c.hits === 0 || c.hits / c.n < 0.5) continue
      if (!best || c.mean > best.mean + 1e-9 || (Math.abs(c.mean - best.mean) <= 1e-9 && c.n > best.n)) {
        best = { weekday: d, block: b as Block, label: windowLabel(d, b), n: c.n, hits: c.hits, mean: c.mean }
      }
    }
  }
  return best
}

/** The best weekday on its own (every time of day pooled). */
export function bestDay(grid: PatternGrid, minN = 2): { weekday: number; label: string; n: number; hits: number; mean: number } | null {
  let best: { weekday: number; label: string; n: number; hits: number; mean: number } | null = null
  for (let d = 0; d < 7; d++) {
    const c = grid.weekdays[d]
    if (c.n < minN || c.hits === 0 || c.hits / c.n < 0.5) continue
    if (!best || c.mean > best.mean) best = { weekday: d, label: `${WEEKDAYS_LONG[d]}s`, n: c.n, hits: c.hits, mean: c.mean }
  }
  return best
}

// ---------- one store's history ----------

export interface StoreStatus {
  n: number
  hits: number
  last?: Sighting
  /** Most recent visit that found any stock. */
  lastStocked?: Sighting
  /** Most recent time someone caught the vendor restocking. */
  lastRestock?: Sighting
  /** The run of same-kind visits at the end of the history. */
  streak?: { kind: 'stock' | 'empty'; count: number }
}

export function storeStatus(sightings: Sighting[]): StoreStatus {
  const sorted = [...sightings].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const status: StoreStatus = { n: sorted.length, hits: 0 }
  for (const s of sorted) {
    if (hadStock(s.result)) {
      status.hits++
      status.lastStocked = s
    }
    if (s.result === 'restocking') status.lastRestock = s
    status.last = s
  }
  if (sorted.length) {
    const kind = hadStock(sorted[sorted.length - 1].result) ? 'stock' : 'empty'
    let count = 0
    for (let i = sorted.length - 1; i >= 0 && (hadStock(sorted[i].result) ? 'stock' : 'empty') === kind; i--) count++
    status.streak = { kind, count }
  }
  return status
}

// ---------- models across stores and chains ----------

export interface Models {
  global: PatternGrid
  chain: Map<string, PatternGrid>
  store: Map<string, PatternGrid>
}

/** One grid per chain (shrunk toward the overall rate) and per store (shrunk toward its chain). */
export function buildModels(stores: Store[], sightings: Sighting[], now: number): Models {
  const byId = new Map(stores.map((s) => [s.id, s]))
  const known = sightings.filter((s) => byId.has(s.store))
  const global = buildGrid(known, now)

  const perChain = new Map<string, Sighting[]>()
  const perStore = new Map<string, Sighting[]>()
  for (const s of known) {
    const chain = byId.get(s.store)!.chain
    ;(perChain.get(chain) ?? perChain.set(chain, []).get(chain)!).push(s)
    ;(perStore.get(s.store) ?? perStore.set(s.store, []).get(s.store)!).push(s)
  }

  const chain = new Map<string, PatternGrid>()
  for (const c of new Set(stores.map((s) => s.chain))) chain.set(c, buildGrid(perChain.get(c) ?? [], now, { prior: global.all.mean }))
  const store = new Map<string, PatternGrid>()
  for (const s of stores) store.set(s.id, buildGrid(perStore.get(s.id) ?? [], now, { prior: chain.get(s.chain) }))
  return { global, chain, store }
}

export interface ChainSummary {
  chain: string
  /** Total sightings across the chain's stores. */
  n: number
  /** Stores that have at least one sighting. */
  stores: number
  grid: PatternGrid
}

/** Chains that have any sightings, busiest first. */
export function chainSummaries(stores: Store[], sightings: Sighting[], models: Models): ChainSummary[] {
  const byId = new Map(stores.map((s) => [s.id, s]))
  const counts = new Map<string, { n: number; stores: Set<string> }>()
  for (const s of sightings) {
    const st = byId.get(s.store)
    if (!st) continue
    const e = counts.get(st.chain) ?? counts.set(st.chain, { n: 0, stores: new Set() }).get(st.chain)!
    e.n++
    e.stores.add(st.id)
  }
  return [...counts.entries()]
    .map(([chain, e]) => ({ chain, n: e.n, stores: e.stores.size, grid: models.chain.get(chain)! }))
    .filter((c) => c.grid)
    .sort((a, b) => b.n - a.n)
}

// ---------- today's best bets ----------

export interface Slot {
  weekday: number
  block: Block
  /** 0 = today, 1 = tomorrow. */
  dayOffset: number
  /** True for the block we're in right now. */
  now: boolean
}

/** The rest of today's time blocks; after about 9pm, tomorrow's whole day. */
export function upcomingBlocks(now: number, tz = TZ): Slot[] {
  const { weekday, hour, block } = whenParts(now, tz)
  if (hour >= 21) return [0, 1, 2, 3].map((b) => ({ weekday: (weekday + 1) % 7, block: b as Block, dayOffset: 1, now: false }))
  const out: Slot[] = []
  for (let b = block; b < 4; b++) out.push({ weekday, block: b as Block, dayOffset: 0, now: b === block })
  return out
}

export interface Bet {
  store: Store
  /** 0 to 1: chance of finding stock in the best remaining window. */
  score: number
  slot: Slot
  /** What the number rests on: this store's own visits, its chain's, or nothing but the prior. */
  basis: 'store' | 'chain' | 'prior'
  /** The store's own visits in that window. */
  cell: Cell
  /** Every logged store of the same chain, same window. */
  chainCell?: Cell
  /** Total visits logged at this store. */
  n: number
  /** A very recent sighting that overrides the pattern. */
  live?: { kind: 'stock' | 'empty'; result: SightingResult; at: string; by: string }
}

export function todaysBets(stores: Store[], sightings: Sighting[], models: Models, now: number, distOf: (s: Store) => number | undefined): Bet[] {
  const slots = upcomingBlocks(now)
  const latest = new Map<string, Sighting>()
  for (const s of sightings) {
    const t = Date.parse(s.at)
    if (Number.isNaN(t) || t > now || now - t > LIVE_WINDOW_MS) continue
    const prev = latest.get(s.store)
    if (!prev || Date.parse(prev.at) < t) latest.set(s.store, s)
  }

  const bets: Bet[] = []
  for (const store of stores) {
    const grid = models.store.get(store.id)
    const chain = models.chain.get(store.chain)
    if (!grid) continue
    const seen = latest.get(store.id)
    const live: Bet['live'] = seen ? { kind: hadStock(seen.result) ? 'stock' : 'empty', result: seen.result, at: seen.at, by: seen.by } : undefined

    let best: { score: number; slot: Slot } | undefined
    for (const slot of slots) {
      let score = grid.cells[slot.weekday][slot.block].mean
      if (live && slot.now) {
        if (live.kind === 'empty') score *= 0.3
        else score = Math.max(score, live.result === 'limited' ? 0.65 : 0.85)
      }
      if (!best || score > best.score + 1e-9) best = { score, slot }
    }
    if (!best) continue

    const cell = grid.cells[best.slot.weekday][best.slot.block]
    const chainCell = chain?.cells[best.slot.weekday][best.slot.block]
    bets.push({
      store,
      score: best.score,
      slot: best.slot,
      basis: cell.n >= 2 ? 'store' : chainCell && chainCell.n >= 3 ? 'chain' : 'prior',
      cell,
      chainCell,
      n: grid.all.n,
      live,
    })
  }
  return bets.sort((a, b) => b.score - a.score || (distOf(a.store) ?? 99) - (distOf(b.store) ?? 99))
}
