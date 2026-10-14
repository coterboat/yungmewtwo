// Pulls the news feeds (PokéBeach, Reddit's deal and TCG subs) into data/news.json: a rolling list
// of about 300 items, deduped by link, tagged (deal / restock / pre-order / drawing / price error /
// reveal, the retailer, and any product on the watchlist). Each source's last status is stored too,
// so the app can say honestly "Reddit: blocked from GitHub's servers" when it happens.
//
// One request per source per run, with our descriptive User-Agent. Reddit allows roughly one
// request a minute without a login, so its feeds are spaced out by the reset time it reports.
//
// Usage: node scripts/pull-news.ts [--dry] [--fast]
//   --dry   print what would change, write nothing
//   --fast  don't wait out Reddit's rate limit between its feeds

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  NEWS_MAX,
  NEWS_SOURCES,
  classifyFetch,
  hashId,
  keepItem,
  matchWatch,
  mergeNews,
  nextSourceStatus,
  normalizeLink,
  parseFeed,
  tagText,
  type FetchStatus,
  type NewsFile,
  type NewsItem,
  type NewsSourceDef,
} from '../src/lib/dropsNews.ts'
import { EMPTY_NEWS, NEWS_PATH, loadCatalog, loadUserData, watchTargets } from './lib/drops-io.ts'
import { USER_AGENT, readJson, sleep } from './lib/io.ts'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const fast = args.includes('--fast')

interface Answer {
  status?: number
  body: string
  resetSec?: number
  error?: string
}

/** One polite request: no retries, so a blocked source costs one hit. */
async function fetchOnce(url: string): Promise<Answer> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5' },
      signal: AbortSignal.timeout(25_000),
    })
    const reset = Number(res.headers.get('x-ratelimit-reset'))
    return { status: res.status, body: await res.text(), ...(Number.isFinite(reset) && reset > 0 ? { resetSec: reset } : {}) }
  } catch (err) {
    return { body: '', error: (err as Error).message }
  }
}

function describe(a: Answer, status: FetchStatus, count: number): string | undefined {
  if (a.error) return a.error
  if (status === 'ok' || (a.status != null && a.status >= 200 && a.status < 300 && count === 0)) return count === 0 ? 'the feed had no items' : undefined
  if (a.status === 429) return 'rate limited (HTTP 429)'
  return `HTTP ${a.status}`
}

async function main() {
  const now = new Date().toISOString()
  const prev = await readJson<NewsFile>(NEWS_PATH, EMPTY_NEWS)
  const user = await loadUserData()
  const targets = watchTargets(user.watch, await loadCatalog())
  console.log(`watching ${targets.length} products for news mentions`)

  let items = prev.items
  const sources: NewsFile['sources'] = { ...prev.sources }
  let nextRedditAt = 0

  for (const def of NEWS_SOURCES as readonly NewsSourceDef[]) {
    if (def.rateLimited && !fast) {
      const wait = nextRedditAt - Date.now()
      if (wait > 0) {
        console.log(`waiting ${Math.ceil(wait / 1000)}s for Reddit's rate limit`)
        await sleep(wait)
      }
    }
    const answer = await fetchOnce(def.url)
    if (def.rateLimited) nextRedditAt = Date.now() + Math.min((answer.resetSec ?? 60) + 3, 75) * 1000

    const status = classifyFetch(answer.status, answer.body)
    const raw = status === 'ok' ? parseFeed(answer.body) : []
    const fresh: NewsItem[] = []
    for (const r of raw) {
      const tags = tagText(r.title, r.summary)
      const watch = matchWatch(`${r.title} ${r.summary}`, targets)
      if (!keepItem(def, r.title, tags, watch)) continue
      const link = normalizeLink(r.link)
      const date = r.date && Date.parse(r.date) < Date.now() + 3_600_000 ? r.date : now
      fresh.push({
        id: hashId(link),
        source: def.id,
        title: r.title,
        link,
        date,
        seen: now,
        ...(r.summary ? { summary: r.summary.length > 220 ? `${r.summary.slice(0, 217).trimEnd()}...` : r.summary } : {}),
        ...(r.author ? { author: r.author } : {}),
        tags,
        ...(watch.length ? { watch } : {}),
      })
    }
    const known = new Set(items.map((i) => normalizeLink(i.link)))
    const newItems = fresh.filter((i) => !known.has(i.link)).length
    // An unreadable answer isn't "ok" however the HTTP status looked.
    const finalStatus: FetchStatus = status === 'ok' && raw.length === 0 ? 'error' : status
    const message = describe(answer, finalStatus, raw.length)
    sources[def.id] = nextSourceStatus(prev.sources[def.id], def, { status: finalStatus, message, count: raw.length, newItems }, now)
    items = mergeNews(items, fresh, NEWS_MAX)
    console.log(`${def.name}: ${finalStatus}${finalStatus === 'ok' ? `, ${raw.length} read, ${fresh.length} kept, ${newItems} new` : ` (${message})`}`)
  }

  const next: NewsFile = { updatedAt: prev.updatedAt, sources, items }
  const changed = JSON.stringify({ ...next, updatedAt: '' }) !== JSON.stringify({ ...prev, updatedAt: '' })
  if (changed) next.updatedAt = now
  if (!changed) {
    console.log('news unchanged')
    return
  }
  if (dry) {
    console.log(`dry run: would write ${items.length} items`)
    return
  }
  await mkdir(dirname(NEWS_PATH), { recursive: true })
  const lines = [
    '{',
    `"updatedAt":${JSON.stringify(next.updatedAt)},`,
    `"sources":{\n${Object.entries(sources).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n')}\n},`,
    `"items":[\n${items.map((i) => JSON.stringify(i)).join(',\n')}\n]`,
    '}',
    '',
  ]
  await writeFile(NEWS_PATH, lines.join('\n'))
  console.log(`wrote ${items.length} items`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
