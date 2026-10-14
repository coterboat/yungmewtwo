// Builds public/data/ (served by GitHub Pages) from the committed data/ folder.
// Every file in scripts/site/ exports `build(ctx)`; they run in filename order, so one feature's
// builder never needs another's file edited. 00-core.ts writes the price/catalog files most
// features read.
//
// Usage: node scripts/build-site-data.ts

import { readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { VariantPrice } from '../src/lib/site.ts'
import type { PricePoint, Product, SetInfo, Snapshot } from '../src/lib/types.ts'
import { DATA, PUBLIC_DATA, ROOT, readJson, writeJson, writeLines } from './lib/io.ts'

export interface BuildContext {
  sets: SetInfo[]
  setById: Map<number, SetInfo>
  /** Products per set id (codes excluded). */
  catalog: Map<number, Product[]>
  productById: Map<number, Product>
  /** Snapshot dates, oldest first. */
  dates: string[]
  snapshots: Snapshot[]
  latest: Snapshot
  /** Latest price + changes per `${productId}:${variant}`. */
  prices: Map<string, VariantPrice>
  /** Variant keys per product id. */
  variantsOf: Map<number, string[]>
  readData<T>(rel: string, fallback: T): Promise<T>
  write(rel: string, value: unknown, opts?: { lines?: boolean }): Promise<void>
  log(msg: string): void
}

const DAY = 86_400_000

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY)
}

/** Fractional change from the price `days` back (the newest snapshot at least that old), else null. */
function changeOver(snaps: Snapshot[], key: string, now: number | null, days: number): number | null {
  if (now == null || snaps.length < 2) return null
  const latest = snaps[snaps.length - 1].date
  for (let i = snaps.length - 2; i >= 0; i--) {
    const age = daysBetween(snaps[i].date, latest)
    if (age < days) continue
    // A "1 day" change from a 5-day-old snapshot would mislead; allow a little slack only.
    if (age > days * 1.5 + 2) return null
    const then = snaps[i].prices[key]?.[0]
    return then ? (now - then) / then : null
  }
  return null
}

async function main() {
  const t0 = Date.now()
  const sets = await readJson<SetInfo[]>(resolve(DATA, 'catalog', 'sets.json'), [])
  const catalog = new Map<number, Product[]>()
  const productById = new Map<number, Product>()
  for (const s of sets) {
    const products = (await readJson<Product[]>(resolve(DATA, 'catalog', `${s.id}.json`), [])).filter((p) => p.kind !== 'code')
    catalog.set(s.id, products)
    for (const p of products) productById.set(p.id, p)
  }

  const snapDir = resolve(DATA, 'snapshots')
  const dates = (await readdir(snapDir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort()
  const snapshots: Snapshot[] = []
  for (const d of dates) snapshots.push(await readJson<Snapshot>(resolve(snapDir, `${d}.json`), { date: d, source: '', prices: {} }))
  const latest = snapshots[snapshots.length - 1] ?? { date: '', source: '', prices: {} }

  const prices = new Map<string, VariantPrice>()
  const variantsOf = new Map<number, string[]>()
  for (const [key, [m, l]] of Object.entries(latest.prices) as Array<[string, PricePoint]>) {
    prices.set(key, [m, l, changeOver(snapshots, key, m, 1), changeOver(snapshots, key, m, 7), changeOver(snapshots, key, m, 30)])
    const id = Number(key.slice(0, key.indexOf(':')))
    const list = variantsOf.get(id)
    if (list) list.push(key)
    else variantsOf.set(id, [key])
  }

  await rm(PUBLIC_DATA, { recursive: true, force: true })
  const ctx: BuildContext = {
    sets,
    setById: new Map(sets.map((s) => [s.id, s])),
    catalog,
    productById,
    dates,
    snapshots,
    latest,
    prices,
    variantsOf,
    readData: (rel, fallback) => readJson(resolve(DATA, rel), fallback),
    write: (rel, value, opts) =>
      opts?.lines && (Array.isArray(value) || typeof value === 'object')
        ? writeLines(resolve(PUBLIC_DATA, rel), value as unknown[])
        : writeJson(resolve(PUBLIC_DATA, rel), value, false),
    log: (msg) => console.log(`  ${msg}`),
  }

  const siteDir = resolve(ROOT, 'scripts', 'site')
  const builders = (await readdir(siteDir)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort()
  for (const file of builders) {
    const t = Date.now()
    const mod = (await import(pathToFileURL(resolve(siteDir, file)).href)) as { build?: (c: BuildContext) => Promise<void> }
    if (!mod.build) continue
    console.log(`${file}`)
    await mod.build(ctx)
    console.log(`  done in ${Date.now() - t} ms`)
  }
  console.log(`site data built in ${Date.now() - t0} ms (${dates.length} snapshot days, latest ${latest.date})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
