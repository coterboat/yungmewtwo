// X (Twitter) sweep through Grok's live X search (xAI Responses API + the x_search tool).
// Pure pieces: when to run, the request, reading the answer, turning posts into news items, and
// what it cost. scripts/pull-x.ts does the call. xAI bills $5 per 1,000 posts fetched plus tokens,
// so the sweep runs on its own slower clock and logs its spend.
import { hashId, tagText, type NewsItem } from './dropsNews.ts'

export const X_SOURCE_ID = 'x'
export const X_SOURCE_NAME = 'X (via Grok)'
export const XAI_URL = 'https://api.x.ai/v1/responses'
export const DEFAULT_X_MODEL = 'grok-4.7'

/** List prices (USD) as of 2026-09: tokens per 1M, fetched posts/profiles per 1,000. */
export const X_PRICES = { inPerM: 2, outPerM: 6, postsPerK: 5, usersPerK: 10 }

export interface XState {
  lastRun?: string
}

export interface XUsageMonth {
  runs: number
  posts: number
  users: number
  inputTokens: number
  outputTokens: number
  cost: number
}

/** data/x-usage.json: spend per calendar month ("2026-10"), so the app can show it. */
export type XUsage = Record<string, XUsageMonth>

/** Hour of day in New York for an instant. */
function nyHour(now: number): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(now)))
}

/** Run when the last sweep is `everyHours` old (10 min slack for cron drift) and it's 8am–11pm Eastern. */
export function shouldRun(state: XState, now: number, everyHours: number): { run: boolean; why: string } {
  const h = nyHour(now)
  if (h < 8 || h >= 23) return { run: false, why: `quiet hours (${h}:00 ET)` }
  if (!state.lastRun) return { run: true, why: 'first sweep' }
  const age = (now - Date.parse(state.lastRun)) / 3_600_000
  if (age < everyHours - 1 / 6) return { run: false, why: `last sweep ${age.toFixed(1)}h ago, every ${everyHours}h` }
  return { run: true, why: `last sweep ${age.toFixed(1)}h ago` }
}

export const X_SYSTEM = `You watch X for Pokémon TCG buying opportunities for two collectors in the US Southeast: one in metro Atlanta, Georgia (Sandy Springs) and one in Simpsonville / Greenville, South Carolina.

Use the x_search tool (two or three searches at most) for posts from the time window you're given. Look for:
- restocks and drops: Pokémon Center, Target, Walmart, Best Buy, GameStop, Costco, Sam's Club, Amazon, Dick's, Five Below, Barnes & Noble (online drops with times, queue / waiting room openings)
- retailer drawings, lotteries, raffles and invite systems, with their open and close times
- pre-orders opening, new product reveals and release dates
- price errors and deep discounts on sealed product
- in-store stock sightings, especially anywhere in Georgia or South Carolina

Skip resale listings, scalper sales, "follow and retweet" giveaways, memes and unsourced rumors. Prefer original reports with specific times, stores or links.

Reply with only a JSON object, no prose, in this shape:
{"items":[{"title":"short plain headline, under 90 characters","summary":"one sentence with the facts: what, where, when (include times and time zones if given)","url":"https://x.com/<handle>/status/<id> of the post you used","author":"handle without @","postedAt":"ISO time if known, else empty string","kind":"restock|drawing|preorder|deal|price-error|reveal|sighting|other","retailers":["Target"],"local":true}]}
"local" is true only when the post is about a store or area in Georgia or South Carolina. Return at most 12 items, most useful first. Use only URLs of posts you actually found. If nothing qualifies, return {"items":[]}.`

export function xUserPrompt(now: number, windowHours: number): string {
  const from = new Date(now - windowHours * 3_600_000).toISOString()
  return `Time now: ${new Date(now).toISOString()}. Only posts since ${from} (the last ${windowHours} hours).`
}

/** Request body for POST /v1/responses with the x_search tool. from_date is a day (UTC), so we pass yesterday and filter by time ourselves. */
export function xRequestBody(now: number, windowHours: number, model = DEFAULT_X_MODEL): Record<string, unknown> {
  const fromDay = new Date(now - Math.max(windowHours, 24) * 3_600_000).toISOString().slice(0, 10)
  return {
    model,
    input: [
      { role: 'system', content: X_SYSTEM },
      { role: 'user', content: xUserPrompt(now, windowHours) },
    ],
    tools: [{ type: 'x_search', from_date: fromDay }],
  }
}

export interface XAnswer {
  text: string
  citations: string[]
  usage: { inputTokens: number; outputTokens: number; posts: number; users: number }
}

type Json = Record<string, unknown>
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Reads a Responses API answer defensively: text from message parts, URLs from annotations and citations. */
export function readXAnswer(body: Json): XAnswer {
  const texts: string[] = []
  const cites = new Set<string>()
  if (typeof body.output_text === 'string') texts.push(body.output_text)
  for (const item of asArray(body.output) as Json[]) {
    for (const part of asArray(item?.content) as Json[]) {
      if ((part?.type === 'output_text' || part?.type === 'text') && typeof part.text === 'string') texts.push(part.text)
      for (const a of asArray(part?.annotations) as Json[]) if (typeof a?.url === 'string') cites.add(a.url)
    }
  }
  for (const c of asArray(body.citations)) {
    if (typeof c === 'string') cites.add(c)
    else if (c && typeof (c as Json).url === 'string') cites.add((c as Json).url as string)
  }
  const u = (body.usage ?? {}) as Json
  const tools = (u.server_side_tool_usage_details ?? {}) as Json
  return {
    text: [...new Set(texts)].join('\n'),
    citations: [...cites],
    usage: { inputTokens: num(u.input_tokens), outputTokens: num(u.output_tokens), posts: num(tools.x_posts_fetched), users: num(tools.x_users_fetched) },
  }
}

export function costOf(usage: XAnswer['usage']): number {
  const p = X_PRICES
  return (usage.inputTokens * p.inPerM + usage.outputTokens * p.outPerM) / 1e6 + (usage.posts * p.postsPerK + usage.users * p.usersPerK) / 1e3
}

/** The first balanced {...} block in a reply (models sometimes wrap JSON in prose or fences). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  if (start < 0) throw new Error('no JSON object in the reply')
  let depth = 0
  let inStr = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (ch === '\\') i++
      else if (ch === '"') inStr = false
    } else if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1))
  }
  throw new Error('unbalanced JSON in the reply')
}

const STATUS_RE = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/

/** Canonical https://x.com/<handle>/status/<id>, or null if it isn't a post link. */
export function canonicalPostUrl(url: string): string | null {
  const m = url.trim().match(STATUS_RE)
  return m ? `https://x.com/${m[1]}/status/${m[2]}` : null
}

const KIND_TAG: Record<string, string> = { restock: 'restock', drawing: 'drawing', preorder: 'preorder', deal: 'deal', 'price-error': 'price-error', reveal: 'reveal', sighting: 'restock' }

/** Turns the model's items into news items; drops anything without a real post link (and, when the
 *  answer carried citations, anything not among them, so an invented link can't get through). */
export function xItemsToNews(parsed: unknown, citations: string[], now: number, windowHours: number): NewsItem[] {
  const list = asArray((parsed as Json)?.items) as Json[]
  const cited = new Set(citations.map(canonicalPostUrl).filter((u): u is string => !!u))
  const nowIso = new Date(now).toISOString()
  const out: NewsItem[] = []
  for (const it of list) {
    const url = typeof it?.url === 'string' ? canonicalPostUrl(it.url) : null
    const title = typeof it?.title === 'string' ? it.title.trim().slice(0, 140) : ''
    if (!url || !title) continue
    if (cited.size && !cited.has(url)) continue
    const summary = typeof it.summary === 'string' ? it.summary.trim().slice(0, 400) : ''
    const posted = typeof it.postedAt === 'string' && !Number.isNaN(Date.parse(it.postedAt)) ? new Date(it.postedAt).toISOString() : nowIso
    // Older than the window (with slack) means a stale post slipped in.
    if (now - Date.parse(posted) > (windowHours + 6) * 3_600_000) continue
    const tags = new Set(tagText(title, summary))
    const kindTag = typeof it.kind === 'string' ? KIND_TAG[it.kind] : undefined
    if (kindTag) tags.add(kindTag)
    for (const r of asArray(it.retailers)) if (typeof r === 'string') tagText(r).forEach((t) => tags.add(t))
    if (it.local === true) tags.add('local')
    const author = typeof it.author === 'string' ? it.author.replace(/^@/, '') : url.split('/')[3]
    out.push({ id: `x-${hashId(url)}`, source: X_SOURCE_ID, title, link: url, date: posted, seen: nowIso, ...(summary ? { summary } : {}), author, tags: [...tags] })
  }
  return out
}

export function addUsage(usage: XUsage, now: number, u: XAnswer['usage'], cost: number): XUsage {
  const month = new Date(now).toISOString().slice(0, 7)
  const m = usage[month] ?? { runs: 0, posts: 0, users: 0, inputTokens: 0, outputTokens: 0, cost: 0 }
  return {
    ...usage,
    [month]: {
      runs: m.runs + 1,
      posts: m.posts + u.posts,
      users: m.users + u.users,
      inputTokens: m.inputTokens + u.inputTokens,
      outputTokens: m.outputTokens + u.outputTokens,
      cost: Math.round((m.cost + cost) * 10000) / 10000,
    },
  }
}
