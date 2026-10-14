// X sweep: asks Grok (xAI Responses API with live x_search) for the last few hours of posts about
// restocks, drops, drawings, pre-orders, price errors and Georgia/South Carolina sightings, and
// merges them into data/news.json as the "X (via Grok)" source. From there they show in Drops and
// Radar and go through the same alert rules as Reddit and PokéBeach.
//
// Costs real money (xAI: $5 per 1,000 posts fetched + tokens), so it keeps its own clock: every
// X_SEARCH_EVERY_HOURS (default 3) between 8am and 11pm Eastern, whatever the workflow's cadence.
// Each sweep's spend is logged to data/x-usage.json by month.
//
// Env: XAI_API_KEY (required; without it this exits quietly), X_SEARCH_EVERY_HOURS, XAI_MODEL.
// Usage: node scripts/pull-x.ts [--force] [--dry]

import { resolve } from 'node:path'
import { matchWatch, mergeNews, nextSourceStatus, type NewsFile, type NewsItem } from '../src/lib/dropsNews.ts'
import {
  DEFAULT_X_MODEL,
  X_SOURCE_ID,
  X_SOURCE_NAME,
  XAI_URL,
  addUsage,
  costOf,
  extractJson,
  readXAnswer,
  shouldRun,
  xItemsToNews,
  xRequestBody,
  type XState,
  type XUsage,
} from '../src/lib/xSearch.ts'
import { EMPTY_NEWS, NEWS_PATH, loadCatalog, loadUserData, watchTargets } from './lib/drops-io.ts'
import { DATA, readJson, writeJson } from './lib/io.ts'

const args = process.argv.slice(2)
const force = args.includes('--force')
const dry = args.includes('--dry')
const STATE_PATH = resolve(DATA, 'x-state.json')
const USAGE_PATH = resolve(DATA, 'x-usage.json')

async function main() {
  const key = process.env.XAI_API_KEY?.trim()
  if (!key) {
    console.log('XAI_API_KEY is not set; skipping the X sweep.')
    return
  }
  const every = Math.max(1, Number(process.env.X_SEARCH_EVERY_HOURS) || 3)
  const model = process.env.XAI_MODEL?.trim() || DEFAULT_X_MODEL
  const now = Date.now()
  const state = await readJson<XState>(STATE_PATH, {})
  const decision = shouldRun(state, now, every)
  if (!decision.run && !force) {
    console.log(`X sweep skipped: ${decision.why}.`)
    return
  }
  console.log(`X sweep (${decision.why}) with ${model}`)

  const windowHours = every + 1
  const news = await readJson<NewsFile>(NEWS_PATH, EMPTY_NEWS)
  const nowIso = new Date(now).toISOString()
  let status: 'ok' | 'error' = 'ok'
  let message: string | undefined
  let fresh: NewsItem[] = []

  try {
    const res = await fetch(XAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(xRequestBody(now, windowHours, model)),
      signal: AbortSignal.timeout(180_000),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const err = (body.error as { message?: string } | undefined)?.message ?? (typeof body.error === 'string' ? body.error : '')
      throw new Error(`xAI answered ${res.status}${err ? `: ${err}` : ''}`)
    }
    const answer = readXAnswer(body)
    const cost = costOf(answer.usage)
    console.log(`fetched ${answer.usage.posts} posts, ${answer.usage.users} profiles, ${answer.usage.inputTokens}+${answer.usage.outputTokens} tokens: about $${cost.toFixed(3)}`)
    if (!dry) await writeJson(USAGE_PATH, addUsage(await readJson<XUsage>(USAGE_PATH, {}), now, answer.usage, cost))
    const parsed = extractJson(answer.text)
    const targets = watchTargets((await loadUserData()).watch, await loadCatalog())
    fresh = xItemsToNews(parsed, answer.citations, now, windowHours).map((n) => {
      const watch = matchWatch(`${n.title} ${n.summary ?? ''}`, targets)
      return watch.length ? { ...n, watch } : n
    })
    console.log(`${fresh.length} usable posts (${answer.citations.length} citations)`)
    for (const n of fresh) console.log(`  [${n.tags.join(',')}] ${n.title}  ${n.link}`)
  } catch (err) {
    status = 'error'
    message = (err as Error).message
    console.warn(`X sweep failed: ${message}`)
  }

  if (dry) return
  const before = new Set(news.items.map((i) => i.link))
  const items = mergeNews(news.items, fresh)
  const newItems = fresh.filter((n) => !before.has(n.link)).length
  const sources = { ...news.sources, [X_SOURCE_ID]: nextSourceStatus(news.sources[X_SOURCE_ID], { name: X_SOURCE_NAME, url: 'https://x.com' }, { status, message, count: fresh.length, newItems }, nowIso) }
  await writeJson(NEWS_PATH, { updatedAt: nowIso, sources, items } satisfies NewsFile)
  // Advance the clock even after a failure, so a broken key or outage costs one try per cadence.
  await writeJson(STATE_PATH, { lastRun: nowIso } satisfies XState)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
