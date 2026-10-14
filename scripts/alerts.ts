// The phone-alert engine. Reads the latest prices, your two data/user/ files, the release radar and
// the news; works out what's worth a buzz (rules in scripts/lib/alert-rules.ts); sends it to ntfy;
// and records what it sent in data/alerts-log.json so nothing goes out twice.
//
// NTFY_TOPIC is one shared topic ("abc123") or one per person ("alex=abc1,cousin=abc2"). With no
// NTFY_TOPIC (or --dry) nothing is sent or logged: it prints what it would have sent.
//
// Usage: node scripts/alerts.ts [--dry] [--test] [--now=2026-10-14T22:00:00Z]

import { DATA, readJson, writeLines } from './lib/io.ts'
import { resolve } from 'node:path'
import { buildReleases, type MsrpSeed, type SeedRelease } from '../src/lib/drops.ts'
import type { AlertLogEntry } from '../src/lib/dropsAlerts.ts'
import type { NewsFile } from '../src/lib/dropsNews.ts'
import { NTFY_SERVER } from '../src/lib/config.ts'
import { ALERTS_LOG_PATH, EMPTY_NEWS, NEWS_PATH, loadCatalog, loadSnapshots, loadUserData } from './lib/drops-io.ts'
import {
  SITE,
  capAlerts,
  dedupe,
  evaluateAll,
  ntfyPayload,
  parseTopics,
  pruneLog,
  toLogEntry,
  topicsFor,
  type Alert,
  type AlertContext,
} from './lib/alert-rules.ts'

const args = process.argv.slice(2)
const forceDry = args.includes('--dry')
const sendTest = args.includes('--test')
const nowArg = args.find((a) => a.startsWith('--now='))?.slice(6)
const now = nowArg ? Date.parse(nowArg) : Date.now()

const mask = (topic: string) => (topic.length > 6 ? `${topic.slice(0, 2)}…${topic.slice(-2)}` : '…')

async function post(payload: Record<string, unknown>): Promise<string | undefined> {
  try {
    const res = await fetch(NTFY_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'yungmewtwo/0.1 (+https://github.com/coterboat/yungmewtwo)' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    })
    return res.ok ? undefined : `HTTP ${res.status}`
  } catch (err) {
    return (err as Error).message
  }
}

function show(a: Alert, topics: string[]) {
  const who = a.to === 'all' ? 'everyone' : a.to.join(' & ')
  console.log(`\n[${a.kind}] to ${who}${topics.length ? ` (${topics.map(mask).join(', ')})` : ''}  priority ${a.priority}  tags ${a.tags.join(',')}`)
  console.log(`  ${a.title}`)
  for (const line of a.body.split('\n')) console.log(`  ${line}`)
  console.log(`  click: ${a.click}${a.action ? `   button "${a.action.label}": ${a.action.url}` : ''}`)
}

async function main() {
  const topics = parseTopics(process.env.NTFY_TOPIC)
  const dry = forceDry || topics.mode === 'none'
  const user = await loadUserData()

  if (sendTest) {
    if (topics.mode === 'none') {
      console.log('No NTFY_TOPIC set; nothing to test.')
      return
    }
    const test: Alert = { key: 'test', kind: 'test', title: 'yungmewtwo alerts are connected', body: 'If you can read this, phone alerts work.', tags: ['white_check_mark'], priority: 3, click: SITE, to: 'all' }
    for (const t of topicsFor(test, topics, user.people)) console.log(`${mask(t)}: ${(await post(ntfyPayload(test, t, topics, user.people))) ?? 'sent'}`)
    return
  }

  const catalog = await loadCatalog()
  const seed = await readJson<SeedRelease[]>(resolve(DATA, 'seed', 'releases.json'), [])
  const msrp = await readJson<MsrpSeed>(resolve(DATA, 'seed', 'msrp.json'), { byType: {}, byProduct: {} })
  const news = await readJson<NewsFile>(NEWS_PATH, EMPTY_NEWS)
  const log = await readJson<AlertLogEntry[]>(ALERTS_LOG_PATH, [])
  const today = new Date(now).toISOString().slice(0, 10)

  const ctx: AlertContext = {
    now,
    people: user.people,
    posts: user.posts,
    watch: user.watch,
    recurring: user.recurring,
    vaults: user.vaults,
    snapshots: await loadSnapshots(10),
    products: catalog.products,
    sets: catalog.sets,
    releases: buildReleases({ seed, sets: catalog.sets, sealedByGroup: new Map(), today }),
    news: news.items,
    newsSources: news.sources,
    msrp,
  }

  const all = evaluateAll(ctx)
  const fresh = dedupe(all, log, now)
  const capped = capAlerts(fresh)
  const outgoing = capped.summary ? [...capped.send, capped.summary] : capped.send
  console.log(`${all.length} alerts true now, ${fresh.length} not sent before${capped.folded.length ? `, ${capped.folded.length} folded into one summary` : ''}.`)

  if (dry) {
    if (topics.mode === 'none' && !forceDry) console.log('NTFY_TOPIC is not set: dry run, nothing sent or logged.')
    for (const a of outgoing) show(a, [])
    return
  }

  const sent: AlertLogEntry[] = []
  const stamp = new Date(now).toISOString()
  for (const a of outgoing) {
    const targets = topicsFor(a, topics, user.people)
    if (!targets.length) continue
    let ok = 0
    for (const t of targets) {
      const err = await post(ntfyPayload(a, t, topics, user.people))
      if (err) console.log(`::warning::ntfy ${mask(t)} failed for "${a.title}": ${err}`)
      else ok++
    }
    show(a, targets)
    // A failed send isn't logged, so the next run tries it again.
    if (!ok) continue
    if (a === capped.summary) for (const f of capped.folded) sent.push(toLogEntry(f, stamp, true))
    else sent.push(toLogEntry(a, stamp))
  }

  const kept = pruneLog(log, now)
  if (!sent.length && kept.length === log.length) {
    console.log('Nothing new to send.')
    return
  }
  await writeLines(ALERTS_LOG_PATH, [...kept, ...sent])
  console.log(`\nSent ${outgoing.length} ${outgoing.length === 1 ? 'push' : 'pushes'}; log now holds ${kept.length + sent.length} entries.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
