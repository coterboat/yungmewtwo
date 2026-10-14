// Nightly TCGplayer catalog + price pull from tcgcsv.com (free, no key, no CORS, so it runs here
// rather than in the browser). TCGCSV refreshes about 20:00 UTC and asks for at most one full sync
// a day, 100 ms between requests, and a descriptive User-Agent.
//
// Writes (all committed):
//   data/catalog/sets.json        English + Japanese groups (sets), with the day we first saw each one
//   data/catalog/{groupId}.json   products of one group, rewritten only when the group changes
//   data/snapshots/{date}.json    that day's prices, append-only (the history the app charts)
//   data/tcgcsv-state.json        last sync stamp + each group's modifiedOn
//
// Usage: node scripts/pull-tcgcsv.ts [--force] [--only=24688,24831]

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifyKind, classifySealed, variantCode } from '../src/lib/classify.ts'
import type { PricePoint, Product, SetInfo, Snapshot } from '../src/lib/types.ts'
import { DATA, fetchJson, fetchWithRetry, readJson, sleep, todayUtc, writeJson, writeLines } from './lib/io.ts'

const BASE = 'https://tcgcsv.com/tcgplayer'
const CATEGORIES = [
  { id: 3, lang: 'EN' as const },
  { id: 85, lang: 'JP' as const },
]
/** Cards under this market price are bulk; we skip them in snapshots to keep history small. */
const MIN_CARD_PRICE = 0.5

interface TcgGroup {
  groupId: number
  name: string
  abbreviation: string
  isSupplemental: boolean
  publishedOn: string
  modifiedOn: string
}
interface TcgProduct {
  productId: number
  name: string
  groupId: number
  presaleInfo?: { isPresale: boolean; releasedOn: string | null }
  extendedData: Array<{ name: string; value: string }>
}
interface TcgPrice {
  productId: number
  lowPrice: number | null
  marketPrice: number | null
  subTypeName: string
}
interface State {
  lastUpdated: string
  groups: Record<string, string>
}

const args = process.argv.slice(2)
const force = args.includes('--force')
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',').map(Number)

const statePath = resolve(DATA, 'tcgcsv-state.json')
const setsPath = resolve(DATA, 'catalog', 'sets.json')

const round = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100)

function toProduct(p: TcgProduct): Product {
  const ext = Object.fromEntries(p.extendedData.map((e) => [e.name, e.value]))
  const num: string | undefined = ext.Number || undefined
  const rarity: string | undefined = ext.Rarity || undefined
  const kind = classifyKind(num, rarity)
  const out: Product = { id: p.productId, name: p.name, set: p.groupId, kind }
  if (num) out.num = num
  if (rarity) out.rarity = rarity
  if (kind === 'sealed') Object.assign(out, classifySealed(p.name))
  if (ext.UPC) out.upc = ext.UPC
  const released = p.presaleInfo?.releasedOn?.slice(0, 10)
  if (released) out.released = released
  if (p.presaleInfo?.isPresale) out.presale = true
  return out
}

async function main() {
  const state = await readJson<State>(statePath, { lastUpdated: '', groups: {} })
  const lastUpdated = (await (await fetchWithRetry('https://tcgcsv.com/last-updated.txt')).text()).trim()
  const date = lastUpdated.slice(0, 10) || todayUtc()
  const snapPath = resolve(DATA, 'snapshots', `${date}.json`)

  if (!force && !only && lastUpdated === state.lastUpdated && existsSync(snapPath)) {
    console.log(`TCGCSV unchanged since ${lastUpdated}; nothing to do.`)
    return
  }
  console.log(`TCGCSV updated ${lastUpdated}; syncing into snapshot ${date}.`)

  const groups: Array<TcgGroup & { cat: number; lang: SetInfo['lang'] }> = []
  for (const c of CATEGORIES) {
    await sleep(100)
    const rows = (await fetchJson<{ results: TcgGroup[] }>(`${BASE}/${c.id}/groups`)).results
    groups.push(...rows.map((g) => ({ ...g, cat: c.id, lang: c.lang })))
  }
  const prevSets = await readJson<SetInfo[]>(setsPath, [])
  const released = new Map<number, string>()

  const prevSnap = await readJson<Snapshot | null>(snapPath, null)
  const prices: Record<string, PricePoint> = only && prevSnap ? { ...prevSnap.prices } : {}
  let productsFetched = 0
  let failures = 0
  let kept = 0
  let skipped = 0

  for (const g of groups) {
    if (only && !only.includes(g.groupId)) continue
    const catalogPath = resolve(DATA, 'catalog', `${g.groupId}.json`)
    try {
      let products: Product[]
      if (force || state.groups[g.groupId] !== g.modifiedOn || !existsSync(catalogPath)) {
        await sleep(100)
        const raw = await fetchJson<{ results: TcgProduct[] }>(`${BASE}/${g.cat}/${g.groupId}/products`)
        products = raw.results.map(toProduct).sort((a, b) => a.id - b.id)
        await writeLines(catalogPath, products)
        productsFetched++
      } else {
        products = await readJson<Product[]>(catalogPath, [])
      }
      const byId = new Map(products.map((p) => [p.id, p]))
      const day = commonReleaseDate(products)
      if (day) released.set(g.groupId, day)

      await sleep(100)
      const rows = (await fetchJson<{ results: TcgPrice[] }>(`${BASE}/${g.cat}/${g.groupId}/prices`)).results
      for (const r of rows) {
        const p = byId.get(r.productId)
        if (!p || p.kind === 'code') continue
        const market = round(r.marketPrice)
        const low = round(r.lowPrice)
        if (market == null && low == null) continue
        if (p.kind === 'card' && (market ?? low ?? 0) < MIN_CARD_PRICE) {
          skipped++
          continue
        }
        prices[`${r.productId}:${variantCode(r.subTypeName)}`] = [market, low]
        kept++
      }
      state.groups[g.groupId] = g.modifiedOn
    } catch (err) {
      failures++
      console.warn(`group ${g.groupId} (${g.name}) failed: ${(err as Error).message}`)
    }
  }

  await writeLines(setsPath, mergeSets(groups, prevSets, released, date))
  const sorted = Object.fromEntries(Object.entries(prices).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })))
  await writeLines(snapPath, { date: date as unknown, source: `tcgcsv ${lastUpdated}` as unknown, prices: sorted })
  if (!only) state.lastUpdated = lastUpdated
  await writeJson(statePath, state)
  console.log(
    `groups ${groups.length}, product files refreshed ${productsFetched}, price rows kept ${kept}, bulk skipped ${skipped}, failures ${failures}`,
  )
  if (failures > groups.length / 4) process.exit(1)
}

/** The release date most of a group's products share. TCGCSV's group publishedOn is often just its crawl time. */
function commonReleaseDate(products: Product[]): string | undefined {
  const counts = new Map<string, number>()
  for (const p of products) if (p.released) counts.set(p.released, (counts.get(p.released) ?? 0) + 1)
  let best: string | undefined
  for (const [d, n] of counts) if (!best || n > counts.get(best)!) best = d
  return best
}

/** Keeps firstSeen from earlier runs so newly listed groups stand out to the release radar. */
function mergeSets(
  groups: Array<TcgGroup & { lang: SetInfo['lang'] }>,
  prev: SetInfo[],
  released: Map<number, string>,
  date: string,
): SetInfo[] {
  const before = new Map(prev.map((s) => [s.id, s]))
  const firstRun = prev.length === 0
  return groups
    .map((g) => {
      const old = before.get(g.groupId)
      return {
        id: g.groupId,
        name: g.name,
        abbr: g.abbreviation,
        lang: g.lang,
        released: released.get(g.groupId) ?? old?.released ?? g.publishedOn.slice(0, 10),
        supplemental: g.isSupplemental,
        // null = already listed before tracking began (the first run is the baseline).
        firstSeen: old ? old.firstSeen : firstRun ? null : date,
      }
    })
    .sort((a, b) => a.lang.localeCompare(b.lang) || b.released.localeCompare(a.released) || a.id - b.id)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
