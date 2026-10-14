// Cardmarket (EU) prices from TCGdex, as a second opinion that already has a trend before our own
// history fills in. TCGdex is open (CORS *, no key). Its cards carry the TCGplayer product id in
// pricing.tcgplayer.<variant>.productId, which is how we confirm we found the right card:
//   1. GET /cards?name=<name>&localId=<number>   (both are "contains" matches, so we re-filter)
//   2. GET /cards/<setId>-<localId> for the best few candidates until one lists our product id.
// Everything here fails quietly: a card that isn't found simply shows nothing.

const BASE = 'https://api.tcgdex.net/v2/en'

export interface TcgdexBrief {
  id: string
  localId: string
  name: string
}

export interface EuPrices {
  trend: number | null
  avg1: number | null
  avg7: number | null
  avg30: number | null
  low: number | null
}

export interface EuCard {
  /** TCGdex card id, e.g. "me05-116". */
  id: string
  /** When Cardmarket data was last refreshed (ISO). */
  updated: string | undefined
  /** Normal / holofoil prices. */
  normal: EuPrices
  /** Reverse-holo prices when Cardmarket lists them separately. */
  reverse: EuPrices | null
}

/** GETs a path under /v2/en and returns the JSON; null for 404; throws on network errors and 5xx. */
export type TcgdexFetch = (path: string) => Promise<unknown>

// ---------- names and numbers ----------

/** "Mega Darkrai ex - 116/084" -> "Mega Darkrai ex"; "Meowth (74)" -> "Meowth"; "Unown [S]" -> "Unown". */
export function cleanCardName(name: string): string {
  let n = name.split(' - ')[0]
  let prev
  do {
    prev = n
    n = n.replace(/\s*[([][^)\]]*[)\]]\s*$/, '')
  } while (n !== prev)
  return n.trim()
}

/** Name to put in the API query: apostrophes are written differently by each source, so query around them. */
export function nameQuery(clean: string): string {
  if (!/['’`]/.test(clean)) return clean.trim()
  return clean.split(/['’`]/).reduce((best, seg) => (seg.trim().length >= best.trim().length ? seg : best), '').trim()
}

const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')

const firstPart = (num: string) => num.split('/')[0].trim()

/** The number as sent to the API: leading zeros dropped, since older sets store "4" and newer ones "004". */
export function localIdQuery(num: string): string {
  const f = firstPart(num)
  return /^\d+$/.test(f) ? String(Number(f)) : f
}

/** Whether a TCGplayer collector number ("052/101") is this TCGdex local id ("52"). */
export function localIdMatches(num: string, localId: string): boolean {
  const a = firstPart(num)
  const b = localId.trim()
  if (!a || !b) return false
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Number(a) === Number(b)
  return a.toLowerCase() === b.toLowerCase()
}

/** "ME05: Pitch Black" -> "me05", "SV03.5: 151" -> "sv03.5". Only a hint for ordering candidates. */
export function setHintFromName(setName: string): string | undefined {
  const m = /^([A-Za-z]+)(\d+(?:\.\d+)?):/.exec(setName.trim())
  return m ? `${m[1].toLowerCase()}${m[2]}` : undefined
}

/** Candidates with our number and name, same-set-as-hint first. Exact names beat partial ones. */
export function rankCandidates(cands: TcgdexBrief[], clean: string, num: string, setHint: string | undefined): TcgdexBrief[] {
  const target = normName(clean)
  const sameNum = cands.filter((c) => localIdMatches(num, c.localId))
  const exact = sameNum.filter((c) => normName(c.name) === target)
  const pool = exact.length ? exact : sameNum.filter((c) => target && (normName(c.name).includes(target) || target.includes(normName(c.name))))
  const hinted = (c: TcgdexBrief) => (setHint && c.id.toLowerCase().startsWith(`${setHint}-`) ? 0 : 1)
  return pool.map((c, i) => ({ c, i })).sort((a, b) => hinted(a.c) - hinted(b.c) || a.i - b.i).map((x) => x.c)
}

// ---------- parsing a card ----------

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** True when the TCGdex card lists this TCGplayer product id anywhere in its pricing or variants. */
export function cardHasProduct(card: unknown, productId: number): boolean {
  const c = rec(card)
  if (!c) return false
  const tcg = rec(rec(c.pricing)?.tcgplayer)
  if (tcg) for (const v of Object.values(tcg)) if (rec(v)?.productId === productId) return true
  if (Array.isArray(c.variants_detailed)) {
    for (const d of c.variants_detailed) if (rec(rec(d)?.thirdParty)?.tcgplayer === productId) return true
  }
  return false
}

const price = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

function readPrices(cm: Record<string, unknown>, suffix: '' | '-holo'): EuPrices {
  return { trend: price(cm[`trend${suffix}`]), avg1: price(cm[`avg1${suffix}`]), avg7: price(cm[`avg7${suffix}`]), avg30: price(cm[`avg30${suffix}`]), low: price(cm[`low${suffix}`]) }
}

const hasAny = (p: EuPrices) => p.trend != null || p.avg1 != null || p.avg7 != null || p.avg30 != null || p.low != null

/** Cardmarket EUR prices off a TCGdex card. Zeros mean "no data" there, so they become null. */
export function cardmarketPrices(card: unknown): Omit<EuCard, 'id'> | null {
  const cm = rec(rec(rec(card)?.pricing)?.cardmarket)
  if (!cm) return null
  const normal = readPrices(cm, '')
  const holo = readPrices(cm, '-holo')
  if (!hasAny(normal) && !hasAny(holo)) return null
  return { updated: typeof cm.updated === 'string' ? cm.updated : undefined, normal, reverse: hasAny(holo) ? holo : null }
}

/** 7-day average against the 30-day one; within 2% counts as flat. */
export function trendSignal(avg7: number | null | undefined, avg30: number | null | undefined): { dir: 'up' | 'down' | 'flat'; pct: number } | null {
  if (!avg7 || !avg30 || avg7 <= 0 || avg30 <= 0) return null
  const pct = Math.round((avg7 / avg30 - 1) * 10_000) / 10_000
  return { dir: Math.abs(pct) < 0.02 ? 'flat' : pct > 0 ? 'up' : 'down', pct }
}

// ---------- finding the card ----------

export interface EuLookup {
  productId: number
  name: string
  num: string
  setName?: string
}

/** Throws on network trouble; resolves null when the card simply isn't there. */
async function lookup(a: EuLookup, get: TcgdexFetch): Promise<EuCard | null> {
  if (!firstPart(a.num)) return null
  const clean = cleanCardName(a.name)
  const q = nameQuery(clean)
  if (q.length < 2) return null
  const list = await get(`/cards?name=${encodeURIComponent(q)}&localId=${encodeURIComponent(localIdQuery(a.num))}`)
  if (!Array.isArray(list)) return null
  const ranked = rankCandidates(list as TcgdexBrief[], clean, a.num, setHintFromName(a.setName ?? '')).slice(0, 6)
  const fetchCard = (c: TcgdexBrief) => get(`/cards/${encodeURIComponent(c.id)}`)
  const finish = (card: unknown): EuCard | null => {
    const prices = cardmarketPrices(card)
    const id = rec(card)?.id
    return prices && typeof id === 'string' ? { id, ...prices } : null
  }
  // Usually the first (set-hinted) candidate is the one; only fan out when it isn't.
  if (!ranked.length) return null
  const first = await fetchCard(ranked[0])
  if (cardHasProduct(first, a.productId)) return finish(first)
  const rest = await Promise.all(ranked.slice(1).map(fetchCard))
  const hit = rest.find((c) => cardHasProduct(c, a.productId))
  return hit ? finish(hit) : null
}

/** For tests and callers that want a quiet null on any failure. */
export async function findEuPrice(a: EuLookup, get: TcgdexFetch): Promise<EuCard | null> {
  try {
    return await lookup(a, get)
  } catch {
    return null
  }
}

async function browserGet(path: string): Promise<unknown> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 9000)
  try {
    const r = await fetch(`${BASE}${path}`, { signal: ctl.signal })
    if (r.status === 404) return null
    if (!r.ok) throw new Error(`TCGdex ${r.status}`)
    return await r.json()
  } finally {
    clearTimeout(timer)
  }
}

const CACHE_PREFIX = 'ymt:eu1:'
const inflight = new Map<number, Promise<EuCard | null>>()

function readCache(productId: number): { hit: boolean; card: EuCard | null } {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + productId)
    if (raw) return { hit: true, card: (JSON.parse(raw) as { card: EuCard | null }).card }
  } catch {
    /* storage unavailable */
  }
  return { hit: false, card: null }
}

function writeCache(productId: number, card: EuCard | null) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + productId, JSON.stringify({ card }))
  } catch {
    /* storage unavailable or full: we just refetch next time */
  }
}

/** Looks the card up once per tab session (found or not found); network errors are not remembered. */
export function getEuPrice(a: EuLookup): Promise<EuCard | null> {
  const cached = readCache(a.productId)
  if (cached.hit) return Promise.resolve(cached.card)
  let p = inflight.get(a.productId)
  if (!p) {
    p = lookup(a, browserGet).then(
      (card) => {
        writeCache(a.productId, card)
        return card
      },
      () => null,
    )
    p.finally(() => inflight.delete(a.productId))
    inflight.set(a.productId, p)
  }
  return p
}
