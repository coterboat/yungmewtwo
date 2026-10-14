// Pure logic behind the Market, Set and Item screens: history honesty, search/filter/sort,
// watch targets, sealed-vs-MSRP math, set grouping. No DOM and no React, so it is all testable.
import { headline } from './data.ts'
import { netProceeds, PLATFORMS } from './fees.ts'
import { searchIndex } from './search.ts'
import type { IndexRow, SealedRow, SetHistory, SetSummary, SiteProduct } from './site.ts'
import type { SealedType } from './types.ts'
import type { WatchItem } from './user.ts'

// ---------- history honesty ----------

export const WINDOWS = [1, 7, 30] as const
export type Window = (typeof WINDOWS)[number]

const DAY = 86_400_000
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`)

export function addDays(date: string, n: number): string {
  return new Date(utc(date) + n * DAY).toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAY)
}

export interface HistoryStatus {
  /** Snapshot days we hold. */
  count: number
  first: string | undefined
  last: string | undefined
  /** Calendar days from first to last snapshot. */
  spanDays: number
  /** Whether a change over this many days can be computed yet. */
  ready: Record<Window, boolean>
  /** The date each window's change first becomes available (first snapshot + window). */
  appears: Record<Window, string | undefined>
}

export function historyStatus(dates: string[]): HistoryStatus {
  const first = dates[0]
  const last = dates[dates.length - 1]
  const spanDays = first && last ? daysBetween(first, last) : 0
  const ready = { 1: spanDays >= 1, 7: spanDays >= 7, 30: spanDays >= 30 } as Record<Window, boolean>
  const appears = {
    1: first && addDays(first, 1),
    7: first && addDays(first, 7),
    30: first && addDays(first, 30),
  } as Record<Window, string | undefined>
  return { count: dates.length, first, last, spanDays, ready, appears }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** What history exists (lead) and when each change window starts to show (detail); null once everything is live. */
export function historyNoteParts(s: HistoryStatus, fmt: (date: string) => string): { lead: string; next: string; detail: string } | null {
  if (!s.count || !s.first || s.ready[30]) return null
  const soonest = WINDOWS.find((w) => !s.ready[w])!
  const pending = WINDOWS.filter((w) => !s.ready[w]).map((w) => `${w}-day around ${fmt(s.appears[w]!)}`)
  const lead = s.count === 1 ? `Price history started ${fmt(s.first)} (1 day so far).` : `Price history runs from ${fmt(s.first)} (${plural(s.count, 'day')} so far).`
  return { lead, next: `${soonest}-day changes from ${fmt(s.appears[soonest]!)}.`, detail: `Changes show up as it builds: ${pending.join(', ')}.` }
}

/** The whole note as one string; null once everything is live. */
export function historyNote(s: HistoryStatus, fmt: (date: string) => string): string | null {
  const parts = historyNoteParts(s, fmt)
  return parts && `${parts.lead} ${parts.detail}`
}

/** Index of the first date inside the last `days` days (null = everything). Tolerates gaps in the dates. */
export function rangeStart(dates: string[], days: number | null): number {
  if (!days || dates.length < 2) return 0
  const cutoff = addDays(dates[dates.length - 1], -days)
  const i = dates.findIndex((d) => d >= cutoff)
  return i < 0 ? 0 : i
}

// ---------- card numbers, rarity, variants ----------

const NUM_RE = /^([A-Za-z]*)(\d+)([A-Za-z]?)/

/** Natural ordering for card numbers: 9/99 < 010/099 < 116/084 < SWSH001 < TG01/TG30; blank last. */
export function compareNum(a: string | undefined, b: string | undefined): number {
  const ma = a ? NUM_RE.exec(a) : null
  const mb = b ? NUM_RE.exec(b) : null
  if (!ma || !mb) return ma ? -1 : mb ? 1 : (a ?? '').localeCompare(b ?? '')
  const pa = ma[1].toUpperCase()
  const pb = mb[1].toUpperCase()
  if (pa !== pb) return pa === '' ? -1 : pb === '' ? 1 : pa < pb ? -1 : 1
  const d = Number(ma[2]) - Number(mb[2])
  return d || ma[3].localeCompare(mb[3])
}

const RARITY_RANK: Record<string, number> = {
  common: 1,
  'common holo': 1.5,
  uncommon: 2,
  promo: 2.5,
  rare: 3,
  'holo rare': 4,
  'rare holo': 4,
  'rare break': 5,
  'rare ace': 5,
  'ace spec rare': 5,
  'ace rare': 5,
  'double rare': 5,
  'super rare': 5,
  'triple rare': 6,
  'classic collection': 6,
  'ultra rare': 7,
  'shiny rare': 7,
  'character rare': 7,
  'trainer rare': 7,
  'art rare': 8,
  'illustration rare': 8,
  'shiny holo rare': 8.5,
  'shiny ultra rare': 8.5,
  'radiant rare': 8,
  'amazing rare': 8,
  'prism rare': 8,
  'pikachu rare': 8,
  'futuristic rare': 8,
  'black white rare': 9,
  'rgb rare': 9,
  'secret rare': 9.5,
  'special illustration rare': 10,
  'special art rare': 10,
  'shiny secret rare': 10,
  'rainbow rare': 11,
  'hyper rare': 12,
  'mega hyper rare': 13,
  'mega attack rare': 13,
}

/** Rough order of scarcity for sorting and chip order; 0 = unknown / not a rarity. */
export function rarityRank(rarity: string | undefined): number {
  if (!rarity) return 0
  const r = rarity.trim().toLowerCase()
  if (!r || r === 'none' || r === 'unconfirmed') return 0
  return RARITY_RANK[r] ?? 4
}

const VARIANT_ORDER = ['N', 'H', 'R', 'U', 'UH', '1N', '1H']

export function variantOrder(codes: string[]): string[] {
  const rank = (c: string) => {
    const i = VARIANT_ORDER.indexOf(c)
    return i < 0 ? VARIANT_ORDER.length : i
  }
  return [...codes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/** The variant to show: the wanted one if this product has it, otherwise the headline (priciest) one. */
export function pickVariant(p: SiteProduct, wanted?: string | null): string | undefined {
  if (wanted && p.v[wanted]) return wanted
  return headline(p)?.[0]
}

// ---------- sorting a set's products ----------

export type ProductSortKey = 'num' | 'name' | 'rarity' | 'price' | 'low' | 'c7' | 'c30'

/** Market (or lowest listing when there is no market) of the headline variant. */
export function leadPrice(p: SiteProduct): number | null {
  const h = headline(p)
  return h ? (h[1][0] ?? h[1][1]) : null
}

function sortValue(p: SiteProduct, key: ProductSortKey): number | null {
  const h = headline(p)?.[1]
  switch (key) {
    case 'price':
      return leadPrice(p)
    case 'low':
      return h?.[1] ?? null
    case 'c7':
      return h?.[3] ?? null
    case 'c30':
      return h?.[4] ?? null
    default:
      return null
  }
}

/** Stable sort; products with no value for the key always sink to the bottom. */
export function sortProducts(products: SiteProduct[], key: ProductSortKey, dir: 'asc' | 'desc'): SiteProduct[] {
  const sign = dir === 'asc' ? 1 : -1
  const out = products.map((p, i) => ({ p, i }))
  out.sort((x, y) => {
    let c = 0
    if (key === 'num') {
      const nx = x.p.num
      const ny = y.p.num
      if (!nx || !ny) return nx ? -1 : ny ? 1 : x.i - y.i
      c = compareNum(nx, ny) * sign
    } else if (key === 'name') {
      c = x.p.name.localeCompare(y.p.name) * sign
    } else if (key === 'rarity') {
      c = (rarityRank(x.p.rarity) - rarityRank(y.p.rarity)) * sign
      if (!c) {
        const px = leadPrice(x.p)
        const py = leadPrice(y.p)
        if (px == null || py == null) return px == null && py == null ? x.i - y.i : px == null ? 1 : -1
        c = (px - py) * sign
      }
    } else {
      const vx = sortValue(x.p, key)
      const vy = sortValue(y.p, key)
      if (vx == null || vy == null) return vx == null && vy == null ? x.i - y.i : vx == null ? 1 : -1
      c = (vx - vy) * sign
    }
    return c || x.i - y.i
  })
  return out.map((o) => o.p)
}

// ---------- item price helpers ----------

/** "Listings under market": lowest listing is at least 20% below market. Ignores pennies. */
export function lowCallout(market: number | null | undefined, low: number | null | undefined): { pct: number } | null {
  if (market == null || low == null || market < 1 || low <= 0) return null
  return low <= market * 0.8 ? { pct: low / market - 1 } : null
}

/** Net profit if you bought the cheapest listing and sold at market on TCGplayer, after fees (estimate). */
export function flipAtLow(market: number | null | undefined, low: number | null | undefined): number | null {
  if (market == null || low == null) return null
  return Math.round((netProceeds(market, PLATFORMS[0]) - low) * 100) / 100
}

export const perPack = (price: number | null | undefined, packs: number | null | undefined) => (price != null && packs ? price / packs : null)

// ---------- watch targets ----------

export interface TargetState {
  target: number
  hit: boolean
  /** 0..1: how close the market is to the target (1 = reached). */
  ratio: number
  /** Dollars the market still has to move (buy: market − target; sell: target − market); ≤ 0 once hit. */
  gap: number
  /** Move still needed as a fraction of the market: buy −0.2 = must fall 20%; sell +0.25 = must rise 25%. */
  needPct: number
}

export function buyState(market: number | null | undefined, target: number | null | undefined): TargetState | null {
  if (!market || !target || target <= 0) return null
  return { target, hit: market <= target, ratio: Math.min(1, target / market), gap: market - target, needPct: (target - market) / market }
}

export function sellState(market: number | null | undefined, above: number | null | undefined): TargetState | null {
  if (!market || !above || above <= 0) return null
  return { target: above, hit: market >= above, ratio: Math.min(1, market / above), gap: above - market, needPct: above / market - 1 }
}

/** My watch for this product and variant; a watch saved without a variant covers all of them. */
export function findWatch(items: WatchItem[], by: string, productId: number, variant?: string): WatchItem | undefined {
  const mine = items.filter((w) => w.by === by && w.productId === productId)
  return mine.find((w) => (w.variant ?? '') === (variant ?? '')) ?? mine.find((w) => !w.variant)
}

// ---------- sealed vs MSRP ----------

export const ABOVE_MSRP = 1.05
export const AT_MSRP = 1.02

export type MsrpConf = 'high' | 'med' | 'low' | undefined

export interface MsrpRow {
  row: SealedRow
  /** The MSRP used (same as row.msrp). */
  msrp: number
  /** How firm our MSRP is: high = documented, med = derived or one source, low = single-source guess. */
  conf: MsrpConf
  /** market / MSRP */
  ratio: number
  perPack: number | null
  /** Estimated profit if bought at MSRP and sold at market on TCGplayer (after fees and shipping). */
  est: number
}

/** The shape of data/seed/msrp.json that matters here. */
export interface MsrpSeed {
  byType: Record<string, { msrp: number | null; packs?: number | null; confidence?: string }>
  byProduct: Record<string, { msrp: number | null; packs?: number | null; confidence?: string }>
}

/** Types sold at one price everywhere, so a type-wide MSRP is safe to apply. Collections, tins, blisters and decks vary a lot. */
const UNIFORM_TYPES = new Set<SealedType>(['booster-box', 'etb', 'pc-etb', 'bundle', 'build-battle'])

/** Displays, cases and "A + B" combo listings hold more than one unit; comparing them to one unit's MSRP is nonsense. */
const MULTI_UNIT = /\b(display|case)\b|\+/i

const asConf = (c: string | undefined): MsrpConf => (c === 'high' || c === 'med' || c === 'low' ? c : undefined)

/**
 * The MSRP we are willing to compare this product against, or null. Product-level entries in the seed always count;
 * a type-wide MSRP only counts for types that have one price everywhere. Until the seed loads, any MSRP counts.
 */
export function msrpFor(p: { id: number; name: string; sealed?: SealedType; msrp?: number }, seed: MsrpSeed | undefined): { msrp: number; conf: MsrpConf } | null {
  if (!p.msrp || MULTI_UNIT.test(p.name)) return null
  if (!seed) return { msrp: p.msrp, conf: undefined }
  const own = seed.byProduct[String(p.id)]
  if (own?.msrp) return { msrp: p.msrp, conf: asConf(own.confidence) }
  if (p.sealed && UNIFORM_TYPES.has(p.sealed)) return { msrp: p.msrp, conf: asConf(seed.byType[p.sealed]?.confidence) }
  return null
}

/** Typical cost to ship the item to a buyer; boxes cost more than packs. Estimates. */
export function sealedShipping(type: SealedType | undefined): number {
  switch (type) {
    case 'booster-box':
    case 'case':
      return 10
    case 'upc':
    case 'premium-collection':
      return 9
    case 'etb':
    case 'pc-etb':
      return 7
    case 'bundle':
    case 'collection':
    case 'tin':
    case 'build-battle':
    case 'deck':
    case 'art-bundle':
    case 'half-box':
      return 6
    case 'pack':
    case 'sleeved-pack':
    case 'blister':
      return 2
    default:
      return 6
  }
}

export function estimateSealedFlip(market: number, msrp: number, type: SealedType | undefined): number {
  const platform = { ...PLATFORMS[0], ship: sealedShipping(type) }
  return Math.round((netProceeds(market, platform) - msrp) * 100) / 100
}

export function msrpRows(rows: SealedRow[], lang: 'EN' | 'JP' = 'EN', seed?: MsrpSeed): MsrpRow[] {
  const out: MsrpRow[] = []
  for (const row of rows) {
    if (row.lang !== lang || !row.market || row.market <= 0) continue
    const m = msrpFor(row, seed)
    if (!m) continue
    out.push({ row, msrp: m.msrp, conf: m.conf, ratio: row.market / m.msrp, perPack: perPack(row.market, row.packs), est: estimateSealedFlip(row.market, m.msrp, row.sealed) })
  }
  return out
}

/** The products closest to (or furthest under) MSRP, for when nothing is at or under it. */
export function closestToMsrp(rows: MsrpRow[], n: number): MsrpRow[] {
  return [...rows].sort((a, b) => a.ratio - b.ratio).slice(0, n)
}

export function splitMsrp(rows: MsrpRow[], order: 'ratio' | 'profit'): { above: MsrpRow[]; under: MsrpRow[] } {
  const above = rows.filter((r) => r.ratio >= ABOVE_MSRP).sort((a, b) => (order === 'profit' ? b.est - a.est : b.ratio - a.ratio))
  const under = rows.filter((r) => r.ratio <= AT_MSRP).sort((a, b) => a.ratio - b.ratio)
  return { above, under }
}

// ---------- sets ----------

/** TCGplayer lists some old groups with the date our first pull ran; that is not a real release date. */
export function releaseKnown(set: SetSummary, trackingStart: string | undefined): boolean {
  return !(set.firstSeen == null && trackingStart != null && set.released === trackingStart)
}

export interface SetGroups {
  upcoming: SetSummary[]
  released: SetSummary[]
  undated: SetSummary[]
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')

export function groupSets(sets: SetSummary[], opts: { lang: 'EN' | 'JP'; trackingStart: string | undefined; today: string; query: string; showExtras: boolean }): SetGroups {
  const words = norm(opts.query).split(/\s+/).filter(Boolean)
  const upcoming: SetSummary[] = []
  const released: SetSummary[] = []
  const undated: SetSummary[] = []
  for (const s of sets) {
    if (s.lang !== opts.lang || (s.supplemental && !opts.showExtras)) continue
    if (words.length) {
      const hay = norm(`${s.name} ${s.abbr}`)
      if (!words.every((w) => hay.includes(w))) continue
    }
    if (!releaseKnown(s, opts.trackingStart)) undated.push(s)
    else if (s.released > opts.today) upcoming.push(s)
    else released.push(s)
  }
  upcoming.sort((a, b) => a.released.localeCompare(b.released) || a.name.localeCompare(b.name))
  released.sort((a, b) => b.released.localeCompare(a.released) || a.name.localeCompare(b.name))
  undated.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
  return { upcoming, released, undated }
}

/** All sets of a language, newest first with undated ones last, for the set picker. */
export function setPickerOrder(sets: SetSummary[], lang: 'EN' | 'JP', trackingStart: string | undefined, today: string): SetSummary[] {
  const g = groupSets(sets, { lang, trackingStart, today, query: '', showExtras: true })
  return [...g.upcoming.reverse(), ...g.released, ...g.undated]
}

// ---------- set value over time ----------

/** `${id}:${variant}` of each set's top cards by headline price. */
export function topCardKeys(products: SiteProduct[], n = 20): string[] {
  const priced: Array<{ key: string; price: number }> = []
  for (const p of products) {
    if (p.kind !== 'card') continue
    const h = headline(p)
    const price = h ? (h[1][0] ?? h[1][1]) : null
    if (h && price != null && price > 0) priced.push({ key: `${p.id}:${h[0]}`, price })
  }
  priced.sort((a, b) => b.price - a.price)
  return priced.slice(0, n).map((p) => p.key)
}

/** Sum of those cards' market price per day; a day with under 80% of them priced is left blank rather than guessed. */
export function setValueSeries(h: SetHistory, keys: string[], minCoverage = 0.8): Array<number | null> {
  const need = Math.max(1, Math.ceil(keys.length * minCoverage))
  return h.dates.map((_, i) => {
    let sum = 0
    let have = 0
    for (const k of keys) {
      const v = h.series[k]?.[i]
      if (v != null) {
        sum += v
        have++
      }
    }
    return have >= need ? Math.round(sum * 100) / 100 : null
  })
}

// ---------- market search ----------

export type KindFilter = 'all' | 'c' | 's'
export type SortMode = 'relevance' | 'price-desc' | 'price-asc' | 'up' | 'down'

export interface SearchFilters {
  q: string
  kind: KindFilter
  set: number | null
  rarity: string | null
  min: number | null
  max: number | null
  sort: SortMode
}

export const NO_FILTERS: SearchFilters = { q: '', kind: 'all', set: null, rarity: null, min: null, max: null, sort: 'relevance' }

const SORTS: SortMode[] = ['relevance', 'price-desc', 'price-asc', 'up', 'down']

/** Reads the search state from URL params, so Back from an item lands on the same results. */
export function filtersFromParams(p: URLSearchParams): SearchFilters {
  const num = (k: string) => {
    const v = p.get(k)
    if (v == null || v.trim() === '') return null
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  const kind = p.get('kind')
  const sort = p.get('sort') as SortMode | null
  return {
    q: p.get('q') ?? '',
    kind: kind === 'c' || kind === 's' ? kind : 'all',
    set: num('set'),
    rarity: p.get('rarity') || null,
    min: num('min'),
    max: num('max'),
    sort: sort && SORTS.includes(sort) ? sort : 'relevance',
  }
}

/** Writes the filters onto a copy of `base`, leaving unrelated params (like `tab`) alone and dropping defaults. */
export function filtersToParams(f: SearchFilters, base: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams(base)
  const put = (k: string, v: string | null) => (v ? out.set(k, v) : out.delete(k))
  put('q', f.q.trim() ? f.q : null)
  put('kind', f.kind === 'all' ? null : f.kind)
  put('set', f.set != null ? String(f.set) : null)
  put('rarity', f.rarity)
  put('min', f.min != null ? String(f.min) : null)
  put('max', f.max != null ? String(f.max) : null)
  put('sort', f.sort === 'relevance' ? null : f.sort)
  return out
}

/** Whether the page should show search results instead of its tabs. */
export function isFiltering(f: SearchFilters): boolean {
  return f.q.trim().length > 0 || f.kind !== 'all' || f.set != null || f.rarity != null || f.min != null || f.max != null
}

const SHORTHAND: Record<string, string> = {
  etb: 'elite trainer box',
  sir: 'special illustration rare',
  ir: 'illustration rare',
  sar: 'special art rare',
  hr: 'hyper rare',
  dr: 'double rare',
  ur: 'ultra rare',
  bb: 'booster box',
  upc: 'ultra premium collection',
}

/** Collector shorthand to the words the catalog uses: "umbreon sir" -> "umbreon special illustration rare". Whole words only. */
export function expandQuery(q: string): string {
  const words = q.trim().split(/\s+/).filter(Boolean)
  const lower = words.map((w) => w.toLowerCase())
  const pcEtb = lower.includes('etb')
  return words.map((w, i) => (pcEtb && lower[i] === 'pc' ? 'pokemon center' : (SHORTHAND[lower[i]] ?? w))).join(' ')
}

export const SEARCH_POOL = 2000

/** Filters the index, searches within what's left, and orders the hits. `rows` is capped at `limit`; `total` is not. */
export function filterRows(rows: IndexRow[], f: SearchFilters, sets: Map<number, SetSummary> | undefined, limit = 400): { rows: IndexRow[]; total: number } {
  const pool = rows.filter((r) => {
    if (f.kind !== 'all' && r[3] !== f.kind) return false
    if (f.set != null && r[2] !== f.set) return false
    if (f.rarity != null && r[5] !== f.rarity) return false
    if (f.min != null || f.max != null) {
      const m = r[7]
      if (m == null) return false
      if (f.min != null && m < f.min) return false
      if (f.max != null && m > f.max) return false
    }
    return true
  })
  let hits: IndexRow[]
  if (f.q.trim()) hits = searchIndex(pool, expandQuery(f.q), sets, { limit: SEARCH_POOL }).map((h) => h.row)
  else hits = pool.slice().sort((a, b) => (b[7] ?? -1) - (a[7] ?? -1))

  const nullsLast = (get: (r: IndexRow) => number | null, sign: 1 | -1) => (a: IndexRow, b: IndexRow) => {
    const x = get(a)
    const y = get(b)
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1
    return (x - y) * sign
  }
  if (f.sort === 'price-desc') hits = hits.slice().sort(nullsLast((r) => r[7], -1))
  else if (f.sort === 'price-asc') hits = hits.slice().sort(nullsLast((r) => r[7], 1))
  else if (f.sort === 'up') hits = hits.slice().sort(nullsLast((r) => r[8], -1))
  else if (f.sort === 'down') hits = hits.slice().sort(nullsLast((r) => r[8], 1))
  return { rows: hits.slice(0, limit), total: hits.length }
}

// ---------- labels and formats ----------

// A collector number written into the product name after a dash: "Mega Darkrai ex - 116/084".
const EMBEDDED_NUM = /\s+-\s+[A-Za-z]{0,5}\d+[a-z]?(?:\/[A-Za-z]{0,5}\d+)?(?=\s|$)/

/** The product name without its embedded collector number (shown separately): "Mega Darkrai ex - 116/084" -> "Mega Darkrai ex". */
export function displayName(name: string): string {
  return name.replace(EMBEDDED_NUM, '').trim()
}

export const SEALED_LABEL: Record<SealedType, string> = {
  'booster-box': 'Booster box',
  'half-box': 'Half booster box',
  etb: 'Elite Trainer Box',
  'pc-etb': 'Pokémon Center ETB',
  bundle: 'Booster bundle',
  pack: 'Booster pack',
  'sleeved-pack': 'Sleeved pack',
  blister: 'Blister',
  'art-bundle': 'Art bundle',
  'build-battle': 'Build & Battle',
  tin: 'Tin',
  upc: 'Ultra-Premium Collection',
  'premium-collection': 'Premium collection',
  collection: 'Collection',
  case: 'Case',
  deck: 'Deck',
  accessory: 'Accessory',
  other: 'Other sealed',
}

const eur0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** €4.49 / €162 */
export function eur(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return Math.abs(n) >= 100 ? eur0.format(n) : eur2.format(n)
}

/** "×3.0" for a market/MSRP ratio. */
export function ratioLabel(ratio: number): string {
  return `×${ratio.toFixed(ratio >= 10 ? 0 : 1)}`
}

/** Distinct rarities in the rows with counts, rarest first, for the filter dropdown. Skips blank and "None". */
export function rarityOptions(rows: IndexRow[], kind: KindFilter = 'all'): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (r[3] !== 'c' || kind === 's') continue
    const rar = r[5]
    if (!rar || rar === 'None') continue
    counts.set(rar, (counts.get(rar) ?? 0) + 1)
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => rarityRank(b.value) - rarityRank(a.value) || b.count - a.count)
}
