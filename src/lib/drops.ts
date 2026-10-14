// The release radar's logic: merges the hand-curated release calendar with what TCGplayer lists,
// pairs Japanese and English sets, and makes honest predictions (English release windows from
// the Japanese lag, Pokémon Center pre-order windows from recent sets). Pure functions, no DOM
// and no Node imports, so scripts/site/30-drops.ts, the alert engine and the Drops page all use it.
import { classifySealed } from './classify.ts'
import type { SealedType, SetInfo } from './types.ts'

export type Region = 'EN' | 'JP'
export type Confidence = 'high' | 'med' | 'low'
export type ReleaseKind = 'main' | 'special' | 'product'

// ---------- seed data (data/seed/releases.json) ----------

export interface SeedProduct {
  type: string
  msrp: number | null
  packs?: number | null
  date?: string
  note?: string
}

export interface SeedRelease {
  id: string
  name: string
  code?: string | null
  abbr?: string | null
  region: Region
  series?: string
  kind: ReleaseKind
  date: string | null
  dateNote?: string
  mapsTo?: string | null
  tcgGroupId?: number | null
  source?: string
  confidence: Confidence
  notes?: string
  prerelease: { start: string; end: string } | null
  preorder: { date: string; where?: string; note?: string } | null
  products: SeedProduct[]
}

// ---------- date helpers (YYYY-MM-DD, UTC) ----------

const DAY = 86_400_000
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`)

export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY)
export const addDays = (d: string, n: number) => new Date(ms(d) + n * DAY).toISOString().slice(0, 10)
export const weekdayOf = (d: string) => new Date(ms(d)).getUTCDay()
export const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

export function monthLabel(d: string): string {
  return new Date(ms(d)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const sortedNums = (xs: number[]) => [...xs].sort((a, b) => a - b)

/** Linear-interpolated quantile of a list of numbers (q in 0..1). */
function quantile(xs: number[], q: number): number {
  const s = sortedNums(xs)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

// ---------- JP -> EN lag ----------

export interface LagStats {
  n: number
  median: number
  min: number
  max: number
  p25: number
  p75: number
  pairs: Array<{ jp: string; en: string; days: number }>
}

/** Same-day global releases (30th Celebration) are not a lag; so are pairs more than ~7 months apart. */
const LAG_RANGE = [14, 210] as const

export function jpEnLag(releases: SeedRelease[]): LagStats | null {
  const byId = new Map(releases.map((r) => [r.id, r]))
  const pairs: LagStats['pairs'] = []
  const seen = new Set<string>()
  for (const en of releases) {
    if (en.region !== 'EN' || !en.date || !en.mapsTo || en.kind === 'product') continue
    const jp = byId.get(en.mapsTo)
    if (!jp || jp.region !== 'JP' || !jp.date) continue
    const days = daysBetween(jp.date, en.date)
    if (days < LAG_RANGE[0] || days > LAG_RANGE[1] || seen.has(jp.id)) continue
    seen.add(jp.id)
    pairs.push({ jp: jp.id, en: en.id, days })
  }
  if (!pairs.length) return null
  pairs.sort((a, b) => (byId.get(a.jp)!.date! < byId.get(b.jp)!.date! ? -1 : 1))
  const days = pairs.map((p) => p.days)
  return {
    n: pairs.length,
    median: Math.round(quantile(days, 0.5)),
    min: Math.min(...days),
    max: Math.max(...days),
    p25: Math.round(quantile(days, 0.25)),
    p75: Math.round(quantile(days, 0.75)),
    pairs,
  }
}

export interface EnglishPrediction {
  /** The middle half of past gaps (25th to 75th percentile). */
  from: string
  to: string
  /** The median gap. */
  likely: string
  /** The full range seen so far. */
  min: string
  max: string
  basis: string
}

export function predictEnglish(jpDate: string, lag: LagStats): EnglishPrediction {
  return {
    from: addDays(jpDate, lag.p25),
    to: addDays(jpDate, lag.p75),
    likely: addDays(jpDate, lag.median),
    min: addDays(jpDate, lag.min),
    max: addDays(jpDate, lag.max),
    basis: `English followed Japan by a median of ${lag.median} days (range ${lag.min}–${lag.max} days across ${lag.n} pairs)`,
  }
}

// ---------- Pokémon Center pre-order timing ----------

export interface PreorderPattern {
  /** How many of the newest sets the window is built from. */
  recent: number
  leadMin: number
  leadMax: number
  /** Recency-weighted mean lead in days. */
  leadMean: number
  /** Most common opening weekday among those sets, recency-weighted (0 = Sunday). */
  weekday: number
  basis: string
  /** Older sets opened much earlier; shown so the shift is visible. */
  earlier?: { min: number; max: number; n: number }
}

const RECENT_SETS = 3
/** Each older set counts 60% as much as the one after it. */
const RECENCY = 0.6

export function preorderPattern(releases: SeedRelease[]): PreorderPattern | null {
  const sets = releases
    .filter((r) => r.region === 'EN' && r.kind === 'main' && r.date && r.preorder?.date)
    .map((r) => ({ date: r.date!, open: r.preorder!.date, lead: daysBetween(r.preorder!.date, r.date!) }))
    .filter((s) => s.lead > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  if (sets.length < 2) return null
  const recent = sets.slice(0, RECENT_SETS)
  const leads = recent.map((s) => s.lead)
  const weights = recent.map((_, i) => RECENCY ** i)
  const wSum = weights.reduce((a, b) => a + b, 0)
  const leadMean = recent.reduce((a, s, i) => a + s.lead * weights[i], 0) / wSum
  const byDay = new Map<number, number>()
  recent.forEach((s, i) => byDay.set(weekdayOf(s.open), (byDay.get(weekdayOf(s.open)) ?? 0) + weights[i]))
  let weekday = weekdayOf(recent[0].open)
  for (const [d, w] of byDay) if (w > (byDay.get(weekday) ?? 0)) weekday = d
  const mostly = (byDay.get(weekday) ?? 0) / wSum >= 0.5
  const leadMin = Math.min(...leads)
  const leadMax = Math.max(...leads)
  const span = leadMin === leadMax ? `${leadMin}` : `${leadMin}–${leadMax}`
  const older = sets.slice(RECENT_SETS).map((s) => s.lead)
  return {
    recent: recent.length,
    leadMin,
    leadMax,
    leadMean,
    weekday,
    basis: `last ${recent.length} sets opened ${span} days out, ${mostly ? 'mostly ' : 'often '}on ${WEEKDAYS[weekday]}`,
    ...(older.length ? { earlier: { min: Math.min(...older), max: Math.max(...older), n: older.length } } : {}),
  }
}

export interface PreorderPrediction {
  from: string
  to: string
  /** The date inside the window that falls on the usual weekday. */
  likely: string
  weekday: number
  basis: string
}

export function predictPreorder(releaseDate: string, pattern: PreorderPattern): PreorderPrediction {
  const from = addDays(releaseDate, -pattern.leadMax)
  const to = addDays(releaseDate, -pattern.leadMin)
  const mean = addDays(releaseDate, -Math.round(pattern.leadMean))
  let likely = mean
  let best = Infinity
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (weekdayOf(d) !== pattern.weekday) continue
    const dist = Math.abs(daysBetween(d, mean))
    if (dist < best) {
      best = dist
      likely = d
    }
  }
  return { from, to, likely, weekday: pattern.weekday, basis: pattern.basis }
}

// ---------- TCGplayer groups ----------

/** Upcoming TCGplayer groups the curated calendar doesn't know yet. A "release date" equal to
 *  today is usually just the crawl date of an old group, so only strictly future dates count. */
export function detectUpcoming(sets: SetInfo[], seed: SeedRelease[], today: string): SetInfo[] {
  const known = new Set(seed.map((r) => r.tcgGroupId).filter((id): id is number => id != null))
  return sets.filter((s) => !s.supplemental && s.released > today && !known.has(s.id))
}

export interface JustListed {
  set: SetInfo
  /** First seen on TCGplayer within the window. */
  isNew: boolean
  /** Days since we first saw it (null if it was listed before tracking began). */
  listedDaysAgo: number | null
}

export const NEW_LISTING_DAYS = 14

/** Groups first seen in the last 14 days, then groups that merely have pre-sale products. */
export function justListed(sets: SetInfo[], withPresale: Set<number>, today: string): JustListed[] {
  const out: JustListed[] = []
  for (const set of sets) {
    const age = set.firstSeen ? daysBetween(set.firstSeen, today) : null
    const isNew = age != null && age >= 0 && age <= NEW_LISTING_DAYS
    if (isNew || withPresale.has(set.id)) out.push({ set, isNew, listedDaysAgo: age })
  }
  return out.sort((a, b) => Number(b.isNew) - Number(a.isNew) || (a.set.released < b.set.released ? -1 : 1))
}

// ---------- MSRP ----------

export interface MsrpSeed {
  byType: Record<string, { msrp: number | null; packs?: number | null }>
  byProduct: Record<string, { msrp: number | null; packs?: number | null; confidence?: string }>
}

/** Today's standard prices (pack $4.49, bundle $26.94, box $161.64, ...) are documented from early 2025 on. */
export const MSRP_ERA = '2025-01-01'
/** Types whose price is standard across sets, so a premium over it means something. */
const SOLID_TYPES = new Set<SealedType>(['booster-box', 'etb', 'pc-etb', 'bundle', 'pack', 'sleeved-pack', 'build-battle'])

export function msrpFor(
  seed: { byType: MsrpSeed['byType']; byProduct: MsrpSeed['byProduct'] },
  p: { id: number; sealed?: SealedType; released?: string },
  lang: Region,
): { value: number; solid: boolean } | null {
  const own = seed.byProduct[p.id]
  if (own?.msrp) return { value: own.msrp, solid: own.confidence === 'high' || own.confidence === 'med' }
  if (lang !== 'EN' || !p.sealed || !p.released || p.released < MSRP_ERA) return null
  const t = seed.byType[p.sealed]?.msrp
  return t ? { value: t, solid: SOLID_TYPES.has(p.sealed) } : null
}

// ---------- products on a release card ----------

export interface TcgSealed {
  id: number
  name: string
  sealed: SealedType
  packs?: number
  msrp: number | null
  /** Whether msrp is a real price for this product (not a rough average for its type). */
  msrpSolid: boolean
  market: number | null
  low: number | null
  presale: boolean
  released?: string
  change7d: number | null
}

export interface ProductRow {
  label: string
  sealed?: SealedType
  msrp: number | null
  packs?: number | null
  /** When this product goes on sale if it differs from the set's date. */
  date?: string
  note?: string
  tcg?: TcgSealed
  /** Market over MSRP, minus one; only when the MSRP is solid. */
  premium: number | null
}

/** Maps a curated product label ("Pokémon Center ETB (2 Kyogre promos)") to a sealed type. */
export function seedProductType(label: string): SealedType {
  const text = label
    .replace(/\bETB\b/g, 'Elite Trainer Box')
    .replace(/booster display box/i, 'Booster Box')
    .replace(/^(.*?)(booster )?pack\s*\(sleeved\)/i, 'Sleeved Booster Pack')
  return classifySealed(text).sealed
}

const tokens = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

export function attachProducts(seedProducts: SeedProduct[], tcg: TcgSealed[]): ProductRow[] {
  const free = tcg.filter((t) => t.sealed !== 'case')
  // Same-type products (three kinds of blister) are told apart by pack count and shared words.
  const take = (type: SealedType, packs: number | null | undefined, label: string): TcgSealed | undefined => {
    const words = tokens(label)
    let pick: TcgSealed | undefined
    let best = -1
    for (const t of free) {
      if (t.sealed !== type) continue
      const score = (packs != null && t.packs === packs ? 3 : 0) + tokens(t.name).filter((w) => words.includes(w)).length
      if (score > best) {
        best = score
        pick = t
      }
    }
    if (pick) free.splice(free.indexOf(pick), 1)
    return pick
  }
  const premium = (market: number | null | undefined, msrp: number | null, solid: boolean) => (market && msrp && solid ? market / msrp - 1 : null)
  const rows: ProductRow[] = seedProducts.map((p) => {
    const sealed = seedProductType(p.type)
    const t = take(sealed, p.packs, p.type)
    const msrp = p.msrp ?? t?.msrp ?? null
    return {
      label: p.type,
      sealed,
      msrp,
      packs: p.packs,
      ...(p.date ? { date: p.date } : {}),
      ...(p.note ? { note: p.note } : {}),
      ...(t ? { tcg: t } : {}),
      // A curated price is documented; otherwise it has to be the product's own solid MSRP.
      premium: premium(t?.market, msrp, p.msrp != null || !!t?.msrpSolid),
    }
  })
  for (const t of free) rows.push({ label: t.name, sealed: t.sealed, msrp: t.msrp, packs: t.packs, tcg: t, premium: premium(t.market, t.msrp, t.msrpSolid) })
  return rows
}

// ---------- merged releases ----------

export interface DropRelease {
  id: string
  name: string
  code?: string
  abbr?: string
  region: Region
  kind: ReleaseKind
  series?: string
  date: string | null
  dateNote?: string
  confidence: Confidence
  /** "seed" = hand-curated calendar; "tcgplayer" = detected on TCGplayer, not in the calendar. */
  origin: 'seed' | 'tcgplayer'
  source?: string
  notes?: string
  prerelease: { start: string; end: string } | null
  preorder: { date: string; where?: string; note?: string } | null
  /** Only for dated English sets that have no pre-order yet. */
  preorderPrediction?: PreorderPrediction
  /** For English sets with no date, and Japanese sets with no English date yet. */
  englishPrediction?: EnglishPrediction
  tcgGroupId?: number
  products: ProductRow[]
  /** Any product on TCGplayer is in pre-sale. */
  presale: boolean
  pair?: { id: string; name: string; region: Region; date: string | null; lagDays: number | null }
}

export interface BuildReleasesInput {
  seed: SeedRelease[]
  sets: SetInfo[]
  /** Sealed products per TCGplayer group id. */
  sealedByGroup: Map<number, TcgSealed[]>
  today: string
}

/** A name like "ME08: Brand New Set" or "M7: Aura Seeker" is a main set; anything else a product. */
function detectedKind(name: string): ReleaseKind {
  return /^(ME|SV|SWSH|SM|XY|M|S)\d+(\.\d+)?\s*:/i.test(name) ? 'main' : 'product'
}

/** "Mega Evolution—Delta Reign" -> "Delta Reign". */
export const shortName = (name: string) => name.replace(/^Mega Evolution\s*[—–-]\s*/, '').trim()

const cleanName = (n: string) => n.replace(/^[A-Za-z]+\d+(\.\d+)?:\s*/, '')

export function buildReleases(input: BuildReleasesInput): DropRelease[] {
  const { seed, sets, sealedByGroup, today } = input
  const lag = jpEnLag(seed)
  const pattern = preorderPattern(seed)
  const byId = new Map(seed.map((r) => [r.id, r]))
  const lagOf = (a: SeedRelease, b: SeedRelease) => {
    const en = a.region === 'EN' ? a : b
    const jp = a.region === 'JP' ? a : b
    return en.date && jp.date ? daysBetween(jp.date, en.date) : null
  }

  // Who points at whom, in either direction.
  const partner = new Map<string, SeedRelease>()
  for (const r of seed) {
    const other = r.mapsTo ? byId.get(r.mapsTo) : undefined
    if (other && other.region !== r.region) {
      partner.set(r.id, other)
      if (!partner.has(other.id)) partner.set(other.id, r)
    }
  }

  const out: DropRelease[] = seed.map((r) => {
    const tcg = r.tcgGroupId ? (sealedByGroup.get(r.tcgGroupId) ?? []) : []
    const rel: DropRelease = {
      id: r.id,
      name: r.name,
      ...(r.code ? { code: r.code } : {}),
      ...(r.abbr ? { abbr: r.abbr } : {}),
      region: r.region,
      kind: r.kind,
      ...(r.series ? { series: r.series } : {}),
      date: r.date,
      ...(r.dateNote ? { dateNote: r.dateNote } : {}),
      confidence: r.confidence,
      origin: 'seed',
      ...(r.source ? { source: r.source } : {}),
      ...(r.notes ? { notes: r.notes } : {}),
      prerelease: r.prerelease,
      preorder: r.preorder,
      ...(r.tcgGroupId ? { tcgGroupId: r.tcgGroupId } : {}),
      products: attachProducts(r.products, tcg),
      presale: tcg.some((t) => t.presale),
    }
    const pr = partner.get(r.id)
    if (pr) rel.pair = { id: pr.id, name: pr.name, region: pr.region, date: pr.date, lagDays: pr.date && r.date ? lagOf(r, pr) : null }
    if (lag && r.kind !== 'product') {
      if (r.region === 'EN' && !r.date && pr?.date) rel.englishPrediction = predictEnglish(pr.date, lag)
      // A Japanese set whose English release isn't dated yet.
      if (r.region === 'JP' && r.date && r.date >= today && !(pr && pr.date)) rel.englishPrediction = predictEnglish(r.date, lag)
    }
    if (pattern && r.region === 'EN' && r.kind === 'main' && r.date && r.date >= today && !r.preorder) rel.preorderPrediction = predictPreorder(r.date, pattern)
    return rel
  })

  for (const s of detectUpcoming(sets, seed, today)) {
    const tcg = sealedByGroup.get(s.id) ?? []
    const kind = detectedKind(s.name)
    const rel: DropRelease = {
      id: `tcg-${s.id}`,
      name: cleanName(s.name),
      ...(s.abbr ? { abbr: s.abbr, code: s.abbr } : {}),
      region: s.lang,
      kind,
      date: s.released,
      dateNote: 'Date from TCGplayer; not confirmed by the curated calendar yet.',
      confidence: 'med',
      origin: 'tcgplayer',
      prerelease: null,
      preorder: null,
      tcgGroupId: s.id,
      products: attachProducts([], tcg),
      presale: tcg.some((t) => t.presale),
    }
    if (pattern && s.lang === 'EN' && kind === 'main') rel.preorderPrediction = predictPreorder(s.released, pattern)
    out.push(rel)
  }
  return out.sort(byDate)
}

const byDate = (a: DropRelease, b: DropRelease) => {
  if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : a.region === b.region ? 0 : a.region === 'EN' ? -1 : 1
  return a.date ? -1 : b.date ? 1 : 0
}

/** The next English set (or special) to come out, today included; products only if no set is coming. */
export function heroRelease<T extends Pick<DropRelease, 'region' | 'kind' | 'date'>>(releases: T[], today: string): T | undefined {
  const upcoming = releases.filter((r) => r.region === 'EN' && r.date && r.date >= today).sort((a, b) => (a.date! < b.date! ? -1 : 1))
  return upcoming.find((r) => r.kind !== 'product') ?? upcoming[0]
}

// ---------- status helpers for the page ----------

export type PreorderStatus =
  | { state: 'none' }
  | { state: 'opened'; date: string; where?: string; note?: string }
  | { state: 'opens'; date: string; where?: string; note?: string }
  | { state: 'predicted'; inWindow: boolean; from: string; to: string; likely: string; basis: string }
  | { state: 'due'; from: string; to: string; basis: string }

export function preorderStatus(r: Pick<DropRelease, 'date' | 'preorder' | 'preorderPrediction'>, today: string): PreorderStatus {
  if (r.preorder) {
    const { date, where, note } = r.preorder
    return { state: date <= today ? 'opened' : 'opens', date, where, note }
  }
  const p = r.preorderPrediction
  if (!p) return { state: 'none' }
  if (today > p.to) return { state: 'due', from: p.from, to: p.to, basis: p.basis }
  return { state: 'predicted', inWindow: today >= p.from, from: p.from, to: p.to, likely: p.likely, basis: p.basis }
}

export type ReleaseStage = 'tba' | 'upcoming' | 'prerelease' | 'out'

export function releaseStage(r: Pick<DropRelease, 'date' | 'prerelease'>, today: string): ReleaseStage {
  if (!r.date) return 'tba'
  if (r.date <= today) return 'out'
  if (r.prerelease && r.prerelease.start <= today && today <= r.prerelease.end) return 'prerelease'
  return 'upcoming'
}

/** Products that go on sale before or after the set's own date (Build & Battle Boxes at prerelease, later collections). */
export function earlyAndLate(rows: ProductRow[], setDate: string | null): { early: ProductRow[]; late: ProductRow[] } {
  if (!setDate) return { early: [], late: [] }
  return { early: rows.filter((r) => r.date && r.date < setDate), late: rows.filter((r) => r.date && r.date > setDate) }
}

const HEADLINE: SealedType[] = ['booster-box', 'etb', 'pc-etb']

/** The products worth putting in a headline: those with a market price, box first. */
export function headlineRows(rows: ProductRow[]): ProductRow[] {
  return HEADLINE.map((t) => rows.find((r) => r.tcg?.sealed === t && r.tcg.market != null)).filter((r): r is ProductRow => !!r)
}

// ---------- recently released: holding up? ----------

export interface HistorySeries {
  dates: string[]
  series: Array<number | null>
}

export interface HoldingProduct {
  productId: number
  name: string
  sealed: SealedType
  msrp: number | null
  market: number | null
  low: number | null
  /** Market over MSRP, minus one. */
  vsMsrp: number | null
  /** Move since the first price we hold; null until there are two points. */
  tracked: { from: string; price: number; change: number; sinceRelease: boolean } | null
}

export interface HoldingRow {
  id: string
  name: string
  code?: string
  date: string
  weeks: number
  products: HoldingProduct[]
}

const HOLDING_TYPES: SealedType[] = ['booster-box', 'etb', 'pc-etb', 'bundle']
export const HOLDING_MONTHS_DAYS = 365
/** Tracking counts as "since release" when our first price is within a week of the release date. */
const SINCE_RELEASE_SLACK = 7

export function holdingUp(input: {
  releases: Array<{ id: string; name: string; code?: string; date: string | null; kind: ReleaseKind; tcgGroupId?: number }>
  products: Map<number, TcgSealed[]>
  history: Map<number, HistorySeries>
  today: string
}): HoldingRow[] {
  const rows: HoldingRow[] = []
  for (const r of input.releases) {
    if (r.kind === 'product' || !r.date || !r.tcgGroupId) continue
    const age = daysBetween(r.date, input.today)
    if (age < 0 || age > HOLDING_MONTHS_DAYS) continue
    const all = input.products.get(r.tcgGroupId) ?? []
    const products: HoldingProduct[] = []
    for (const type of HOLDING_TYPES) {
      const p = all.find((t) => t.sealed === type && t.market != null)
      if (!p) continue
      const h = input.history.get(p.id)
      let tracked: HoldingProduct['tracked'] = null
      if (h) {
        const points = h.dates.map((d, i) => [d, h.series[i]] as const).filter((x): x is readonly [string, number] => x[1] != null)
        if (points.length >= 2 && p.market != null) {
          const [from, price] = points[0]
          tracked = { from, price, change: p.market / price - 1, sinceRelease: daysBetween(r.date, from) <= SINCE_RELEASE_SLACK }
        }
      }
      products.push({
        productId: p.id,
        name: p.name,
        sealed: type,
        msrp: p.msrp,
        market: p.market,
        low: p.low,
        vsMsrp: p.market && p.msrp && p.msrpSolid ? p.market / p.msrp - 1 : null,
        tracked,
      })
    }
    if (products.length) rows.push({ id: r.id, name: r.name, ...(r.code ? { code: r.code } : {}), date: r.date, weeks: Math.floor(age / 7), products })
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
}

// ---------- the JSON the page loads (public/data/drops.json) ----------

export interface DropsData {
  builtAt: string
  /** Build date (UTC); the page recomputes "today" itself. */
  today: string
  snapshotDate: string
  releases: DropRelease[]
  justListed: Array<{ groupId: number; name: string; lang: Region; released: string; isNew: boolean; listedDaysAgo: number | null; products: TcgSealed[] }>
  holding: HoldingRow[]
  lag: LagStats | null
  preorder: PreorderPattern | null
  /** Days we hold price history for, so the page can say how much "since release" it can know. */
  historyDays: number
}
