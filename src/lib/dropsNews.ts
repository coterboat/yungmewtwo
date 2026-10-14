// News feed plumbing shared by scripts/pull-news.ts, the alert engine and the Drops page:
// a tiny RSS/Atom reader, tagging (deal, restock, drawing, ...), watched-product matching and
// de-duplicating merge. Pure functions; no DOM and no Node imports.
import type { SealedType } from './types.ts'

// ---------- shapes ----------

export type FetchStatus = 'ok' | 'blocked' | 'error'

export interface NewsSourceStatus {
  name: string
  url: string
  status: FetchStatus | 'pending'
  /** When this entry was last written (refreshed every few hours or when something changed). */
  at: string
  /** Last time the source answered properly. */
  lastOk?: string
  /** Items in the latest answer. */
  count?: number
  /** Plain-words reason when not ok, e.g. "HTTP 403: blocked from GitHub's servers". */
  message?: string
}

export interface NewsWatchHit {
  id: number
  name: string
  /** product: names the exact product; set: names only its set (a pre-order or restock for it). */
  level: 'product' | 'set'
}

export interface NewsItem {
  id: string
  /** Key into NewsFile.sources. */
  source: string
  title: string
  link: string
  /** Published (ISO). */
  date: string
  /** When our puller first saw it (ISO). */
  seen: string
  summary?: string
  author?: string
  tags: string[]
  /** Watched products this item names. */
  watch?: NewsWatchHit[]
}

export interface NewsFile {
  updatedAt: string
  sources: Record<string, NewsSourceStatus>
  items: NewsItem[]
}

export const NEWS_MAX = 300

// ---------- tags ----------

export const CATEGORY_TAGS = ['price-error', 'drawing', 'preorder', 'restock', 'deal', 'reveal'] as const
export type CategoryTag = (typeof CATEGORY_TAGS)[number]

export const TAG_LABEL: Record<string, string> = {
  'price-error': 'Price error',
  drawing: 'Drawing',
  preorder: 'Pre-order',
  restock: 'Restock',
  deal: 'Deal',
  reveal: 'Reveal',
  walmart: 'Walmart',
  target: 'Target',
  costco: 'Costco',
  amazon: 'Amazon',
  'best-buy': 'Best Buy',
  gamestop: 'GameStop',
  'pokemon-center': 'Pokémon Center',
  tcgplayer: 'TCGplayer',
  'sams-club': "Sam's Club",
  'barnes-noble': 'Barnes & Noble',
  walgreens: 'Walgreens',
  cvs: 'CVS',
  'five-below': 'Five Below',
  dicks: "Dick's",
  kohls: "Kohl's",
  ebay: 'eBay',
}

export const isCategoryTag = (t: string): t is CategoryTag => (CATEGORY_TAGS as readonly string[]).includes(t)

const RETAILERS: Array<[string, RegExp]> = [
  ['walmart', /\bwalmart\b/],
  ['target', /\btarget\b/],
  ['costco', /\bcostco/],
  ['amazon', /\bamazon\b/],
  ['best-buy', /\bbest ?buy\b/],
  ['gamestop', /\bgame ?stop\b/],
  ['pokemon-center', /\b(pokemon ?center|poke ?center)\b/],
  ['tcgplayer', /\btcg ?player\b/],
  ['sams-club', /\bsam'?s club\b/],
  ['barnes-noble', /\bbarnes (&|and) noble\b/],
  ['walgreens', /\bwalgreens\b/],
  ['cvs', /\bcvs\b/],
  ['five-below', /\bfive below\b/],
  ['dicks', /\bdick'?s (sporting|goods)\b/],
  ['kohls', /\bkohl'?s\b/],
  ['ebay', /\bebay\b/],
]

const PRICE_ERROR = /\bprice (error|glitch|mistake)\b|\bpricing (error|glitch|mistake)\b|\bmis-?priced?\b|\bglitch(ed)?\b/
const DRAWING = /\b(raffles?|lotter(y|ies|ys)|sweepstakes)\b|\bdrawings?\b(?!\s+(a|an|the|into|\d|cards?|supporters?|phase|out|from|power|support|two|three|extra))/
const PREORDER = /\bpre-?orders?\b/
const RESTOCK_STRONG = /\brestocks?(ed|ing)?\b|\bback in stock\b|\bin stock\b|\bdrops?\b|\bdropped\b|\bqueue\b|\bwaiting room\b|\bloaded on\b|\bsells? out\b/
const RESTOCK_WEAK = /\bnow live\b|\blive now\b|\bavailable now\b|\b(up|live|listed) (on|at)\b/
const DEAL = /\bdeals?\b|\d\s?% off|\bon sale\b|\bsales?\b|\bdiscount|\bcoupon|\bclearance\b|\bprice drop|\blowest price|\bbelow msrp|\bunder msrp|\bat msrp\b|\bmsrp\b/
const REVEAL = /\brevealed?\b|\bleaks?\b|\bleaked\b|\bannounc(e|ed|es|ement)\b|\bfirst look\b|\bfull (card )?list\b|\bset list\b|\bteased?\b|\bunveil|\b(to|will) release\b|\bcoming (in|to|this|next)\b/

/** Lowercase, no accents, "&" -> "and": what the regexes run against. */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Category tags first, in priority order, then retailers. */
export function tagText(title: string, summary = ''): string[] {
  const text = norm(`${title} . ${summary.slice(0, 300)}`)
  const out: string[] = []
  const priceError = PRICE_ERROR.test(text)
  const preorder = PREORDER.test(text)
  if (priceError) out.push('price-error')
  if (DRAWING.test(text)) out.push('drawing')
  if (preorder) out.push('preorder')
  if (RESTOCK_STRONG.test(text) || (!preorder && RESTOCK_WEAK.test(text))) out.push('restock')
  if (!priceError && DEAL.test(text)) out.push('deal')
  if (REVEAL.test(text)) out.push('reveal')
  for (const [id, re] of RETAILERS) if (re.test(text)) out.push(id)
  return out
}

// ---------- watched products ----------

export interface WatchTarget {
  id: number
  name: string
  /** Normalized set name ("delta reign"). */
  set: string
  sealed?: SealedType
  /** Normalized card name without number or rarity ("umbreon ex"). */
  card?: string
  num?: string
}

const stripSetPrefix = (name: string) => name.replace(/^[A-Za-z]+\d*(\.\d+)?:\s*/, '')

export function watchTargetFor(p: { id: number; name: string; kind: 'sealed' | 'card'; sealed?: SealedType; num?: string }, setName: string): WatchTarget {
  const t: WatchTarget = { id: p.id, name: p.name, set: norm(stripSetPrefix(setName)).replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim() }
  if (p.kind === 'sealed') {
    if (p.sealed) t.sealed = p.sealed
  } else {
    t.card = norm(p.name.replace(/\s*[-–]\s*[\w/]+\s*$/, '').replace(/\([^)]*\)|\[[^\]]*\]/g, '')).replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (p.num) t.num = p.num.toLowerCase()
  }
  return t
}

const TYPE_WORDS: Partial<Record<SealedType, RegExp>> = {
  etb: /\b(elite trainer boxe?s?|etbs?)\b/,
  'pc-etb': /\b(pokemon center|pc)\b.{0,24}\b(elite trainer|etb)/,
  'booster-box': /\bbooster (boxe?s?|displays?)\b/,
  'half-box': /\bhalf booster\b/,
  bundle: /\b(booster )?bundles?\b/,
  pack: /\bbooster packs?\b/,
  'sleeved-pack': /\bsleeved\b/,
  blister: /\bblisters?\b/,
  'build-battle': /\bbuild and battle\b/,
  tin: /\btins?\b/,
  upc: /\bultra[- ]premium\b|\bupc\b/,
  'premium-collection': /\bpremium collection\b/,
  collection: /\bcollections?\b/,
  deck: /\b(battle|league battle|theme) decks?\b/,
  'art-bundle': /\bart bundles?\b/,
}

export function matchWatch(text: string, targets: WatchTarget[]): NewsWatchHit[] {
  const t = ` ${norm(text).replace(/[^a-z0-9'/ ]+/g, ' ').replace(/\s+/g, ' ')} `
  const has = (phrase: string) => phrase.length > 0 && t.includes(` ${phrase} `)
  const namesAType = Object.values(TYPE_WORDS).some((re) => re?.test(t))
  const out: NewsWatchHit[] = []
  for (const w of targets) {
    const setIn = has(w.set)
    if (w.card) {
      const multi = w.card.includes(' ')
      const numIn = !!w.num && t.includes(` ${w.num} `)
      if (has(w.card) && (multi || setIn || numIn)) out.push({ id: w.id, name: w.name, level: 'product' })
      continue
    }
    if (!setIn) continue
    const typeRe = w.sealed ? TYPE_WORDS[w.sealed] : undefined
    if (typeRe?.test(t)) out.push({ id: w.id, name: w.name, level: 'product' })
    else if (!namesAType) out.push({ id: w.id, name: w.name, level: 'set' })
  }
  return out
}

// ---------- feeds ----------

export interface RawEntry {
  title: string
  link: string
  /** ISO, or '' when the feed gave no usable date. */
  date: string
  author?: string
  summary: string
}

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  agrave: 'à',
  aacute: 'á',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
    }
    return NAMED[code.toLowerCase()] ?? m
  })
}

/** HTML to one line of readable text; bare URLs are dropped. */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/?(p|div|br|li|tr|td|h[1-6]|table|blockquote)\b[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A tag's inner text. CDATA is kept as is; anything else is XML-unescaped once. */
function field(block: string, tag: string): { text: string; cdata: boolean } | undefined {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(block)
  if (!m) return undefined
  const cd = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(m[1])
  return cd ? { text: cd[1], cdata: true } : { text: m[1], cdata: false }
}

const plain = (f: { text: string; cdata: boolean } | undefined) => (f ? (f.cdata ? f.text : decodeEntities(f.text)).trim() : '')
const html = (f: { text: string; cdata: boolean } | undefined) => (f ? stripHtml(f.cdata ? f.text : decodeEntities(f.text)) : '')

function isoDate(s: string): string {
  const t = Date.parse(s)
  return Number.isNaN(t) ? '' : new Date(t).toISOString()
}

/** Reads RSS 2.0 and Atom. Anything else (an HTML challenge page) yields no entries. */
export function parseFeed(xml: string): RawEntry[] {
  const out: RawEntry[] = []
  for (const m of xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)) {
    const block = m[2]
    const title = stripHtml(plain(field(block, 'title')))
    let link = plain(field(block, 'link'))
    if (!link) {
      const links = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)].map((x) => x[1])
      const pick = links.find((a) => !/rel="(?!alternate)/.test(a)) ?? links[0]
      link = decodeEntities(/href="([^"]+)"/.exec(pick ?? '')?.[1] ?? '')
    }
    if (!title || !link) continue
    const date = isoDate(plain(field(block, 'pubDate')) || plain(field(block, 'published')) || plain(field(block, 'updated')) || plain(field(block, 'dc:date')))
    const author = plain(field(block, 'dc:creator')) || stripHtml(plain(field(block, 'name')))
    let summary = html(field(block, 'content:encoded')) || html(field(block, 'description')) || html(field(block, 'content')) || html(field(block, 'summary'))
    // Reddit appends "submitted by /u/x [link] [comments]".
    summary = summary.replace(/\s*submitted by\b[\s\S]*$/i, '').trim()
    out.push({ title, link, date, ...(author ? { author: author.replace(/^\/u\//, '') } : {}), summary })
  }
  return out
}

export function normalizeLink(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^ref$/i.test(k)) u.searchParams.delete(k)
    const search = u.searchParams.toString()
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}${search ? `?${search}` : ''}`
  } catch {
    return url
  }
}

/** Short stable id for a link (FNV-1a). */
export function hashId(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Dedupes by link (the first-seen time wins, tags are unioned), newest first, capped. */
export function mergeNews(existing: NewsItem[], fresh: NewsItem[], max = NEWS_MAX): NewsItem[] {
  const byLink = new Map<string, NewsItem>()
  for (const it of existing) byLink.set(normalizeLink(it.link), it)
  for (const it of fresh) {
    const key = normalizeLink(it.link)
    const old = byLink.get(key)
    if (!old) {
      byLink.set(key, it)
      continue
    }
    const watch = [...(old.watch ?? [])]
    for (const w of it.watch ?? []) if (!watch.some((x) => x.id === w.id)) watch.push(w)
    byLink.set(key, { ...old, tags: [...new Set([...old.tags, ...it.tags])], ...(watch.length ? { watch } : {}) })
  }
  return [...byLink.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, max)
}

/** Reads an HTTP answer the way the UI wants to report it. */
export function classifyFetch(status: number | undefined, body: string): FetchStatus {
  if (status == null) return 'error'
  // 429 is a busy signal, not a ban: the next run tries again.
  if (status === 401 || status === 403 || status === 451) return 'blocked'
  if (status >= 200 && status < 300) return /just a moment|attention required|cf-browser-verification|enable javascript and cookies/i.test(body.slice(0, 4000)) && !/<(rss|feed)\b/i.test(body.slice(0, 2000)) ? 'blocked' : 'ok'
  return 'error'
}

/** Words for the UI when a source isn't ok. */
export function describeSource(s: Pick<NewsSourceStatus, 'name' | 'status' | 'message'>): string {
  if (s.status === 'blocked') return `${s.name}: blocked from GitHub's servers${s.message ? ` (${s.message})` : ''}`
  if (s.status === 'error') return `${s.name}: couldn't be read${s.message ? ` (${s.message})` : ''}`
  if (s.status === 'pending') return `${s.name}: not checked yet`
  return `${s.name}: ok`
}

// ---------- sources ----------

export interface NewsSourceDef {
  id: string
  name: string
  url: string
  /** 'all' keeps every item; a tag list keeps only items with one of those tags (or a watched product). */
  keep: 'all' | readonly string[]
  /** Titles to drop outright (megathreads, moderator posts). */
  skipTitle?: RegExp
  /** Reddit's feeds allow about one request a minute without a login. */
  rateLimited?: boolean
}

/** At most one request per source per run. Reddit goes last so its wait never holds up the rest. */
export const NEWS_SOURCES: readonly NewsSourceDef[] = [
  // The "Front Page News" forum is PokéBeach's news desk; the main /feed is behind Cloudflare.
  { id: 'pokebeach', name: 'PokéBeach news', url: 'https://www.pokebeach.com/forums/forum/front-page-news.18/index.rss', keep: 'all' },
  { id: 'pokebeach-forum', name: 'PokéBeach forum', url: 'https://www.pokebeach.com/forums/forums/-/index.rss', keep: ['price-error', 'drawing', 'preorder', 'restock', 'deal'] },
  { id: 'reddit-deals', name: 'r/PKMNTCGDeals', url: 'https://www.reddit.com/r/PKMNTCGDeals/new/.rss', keep: 'all', skipTitle: /mega ?thread|unban|q\/?a thread|monthly/i, rateLimited: true },
  { id: 'reddit-pokemontcg', name: 'r/PokemonTCG', url: 'https://www.reddit.com/r/PokemonTCG/new/.rss', keep: ['price-error', 'drawing', 'preorder', 'restock'], rateLimited: true },
]

export function keepItem(def: Pick<NewsSourceDef, 'keep' | 'skipTitle'>, title: string, tags: string[], watch: NewsWatchHit[]): boolean {
  if (def.skipTitle?.test(title)) return false
  if (def.keep === 'all') return true
  return watch.some((w) => w.level === 'product') || tags.some((t) => (def.keep as readonly string[]).includes(t))
}

/** How often an unchanged source entry is rewritten, so the data file doesn't churn every run. */
export const HEARTBEAT_MS = 3 * 3_600_000

export function nextSourceStatus(
  prev: NewsSourceStatus | undefined,
  def: Pick<NewsSourceDef, 'name' | 'url'>,
  result: { status: FetchStatus; message?: string; count: number; newItems: number },
  now: string,
): NewsSourceStatus {
  const message = result.message
  if (prev && prev.status === result.status && prev.message === message && result.newItems === 0 && Date.parse(now) - Date.parse(prev.at) < HEARTBEAT_MS) return prev
  const lastOk = result.status === 'ok' ? now : prev?.lastOk
  return { name: def.name, url: def.url, status: result.status, at: now, ...(lastOk ? { lastOk } : {}), count: result.count, ...(message ? { message } : {}) }
}
