// Core site data: per-set product files with prices, search indexes, sealed list, price history,
// movers and meta. Most features read these.
import type { BuildContext } from '../build-site-data.ts'
import type { IndexRow, Mover, Movers, SealedRow, SetHistory, SetSummary, SiteMeta, SiteProduct, VariantPrice } from '../../src/lib/site.ts'
import type { Product, SetInfo } from '../../src/lib/types.ts'

interface MsrpSeed {
  byType: Record<string, { msrp: number | null; packs?: number | null }>
  byProduct: Record<string, { msrp: number | null; packs?: number | null }>
}

/** Today's standard MSRPs (pack $4.49, bundle $26.94, box $161.64, ...) are documented from early 2025 on. */
const MSRP_ERA = '2025-01-01'
const round2 = (n: number) => Math.round(n * 100) / 100

export async function build(ctx: BuildContext) {
  const msrp = await ctx.readData<MsrpSeed>('seed/msrp.json', { byType: {}, byProduct: {} })
  const msrpFor = (p: Product, set: SetInfo) => {
    const own = msrp.byProduct[p.id]?.msrp
    if (own) return own
    if (set.lang === 'EN' && p.sealed && (p.released ?? set.released) >= MSRP_ERA) return msrp.byType[p.sealed]?.msrp ?? undefined
    return undefined
  }
  const packsFor = (p: Product) => msrp.byProduct[p.id]?.packs ?? p.packs

  const summaries: SetSummary[] = []
  const index: Record<SetInfo['lang'], IndexRow[]> = { EN: [], JP: [] }
  const sealedRows: SealedRow[] = []
  let priced = 0

  for (const set of ctx.sets) {
    const products = ctx.catalog.get(set.id) ?? []
    const out: SiteProduct[] = []
    let value = 0
    let cards = 0
    let sealedCount = 0
    const chase: Array<[number, string, number]> = []

    for (const p of products) {
      const v: Record<string, VariantPrice> = {}
      for (const key of ctx.variantsOf.get(p.id) ?? []) v[key.slice(key.indexOf(':') + 1)] = ctx.prices.get(key)!
      let head = ''
      let headPrice = -1
      for (const [code, vp] of Object.entries(v)) {
        const m = vp[0] ?? vp[1] ?? -1
        if (m > headPrice) {
          headPrice = m
          head = code
        }
      }
      if (head) priced++
      const kind = p.kind === 'sealed' ? 'sealed' : 'card'
      const sp: SiteProduct = { id: p.id, name: p.name, set: p.set, kind, v }
      if (p.num) sp.num = p.num
      if (p.rarity) sp.rarity = p.rarity
      if (p.released) sp.released = p.released
      if (p.presale) sp.presale = true
      if (kind === 'sealed') {
        sp.sealed = p.sealed
        const packs = packsFor(p)
        if (packs) sp.packs = packs
        const m = msrpFor(p, set)
        if (m) sp.msrp = m
        sealedCount++
        if (p.sealed !== 'accessory' && p.sealed !== 'case') {
          const hv = head ? v[head] : undefined
          sealedRows.push({
            id: p.id,
            name: p.name,
            set: set.id,
            lang: set.lang,
            sealed: p.sealed ?? 'other',
            packs: sp.packs,
            msrp: sp.msrp,
            market: hv?.[0] ?? null,
            low: hv?.[1] ?? null,
            change7d: hv?.[3] ?? null,
            change30d: hv?.[4] ?? null,
            released: p.released ?? set.released,
            presale: p.presale,
          })
        }
      } else {
        cards++
        if (headPrice > 0) {
          value += headPrice
          chase.push([p.id, p.name, headPrice])
        }
      }
      out.push(sp)
      index[set.lang].push([p.id, p.name, set.id, kind === 'card' ? 'c' : 's', p.num ?? '', p.rarity ?? '', head, headPrice >= 0 ? headPrice : null, head ? v[head][3] : null])
    }

    await ctx.write(`sets/${set.id}.json`, out)
    chase.sort((a, b) => b[2] - a[2])
    summaries.push({ ...set, products: products.length, cards, sealedCount, value: round2(value), chase: chase.slice(0, 3) })
  }

  await ctx.write('sets.json', summaries)
  await ctx.write('index-en.json', index.EN)
  await ctx.write('index-jp.json', index.JP)
  await ctx.write('sealed.json', sealedRows)
  ctx.log(`${summaries.length} sets, ${index.EN.length} EN + ${index.JP.length} JP products, ${sealedRows.length} sealed`)

  await buildHistory(ctx)
  await ctx.write('movers.json', buildMovers(ctx))

  const meta: SiteMeta = {
    builtAt: new Date().toISOString(),
    dates: ctx.dates,
    latest: ctx.latest.date,
    counts: { sets: summaries.length, products: index.EN.length + index.JP.length, priced },
  }
  await ctx.write('meta.json', meta)
}

/** One file per set: every price series we hold for its products, aligned to the shared date list. */
async function buildHistory(ctx: BuildContext) {
  const bySet = new Map<number, SetHistory>()
  const n = ctx.snapshots.length
  ctx.snapshots.forEach((snap, i) => {
    for (const [key, point] of Object.entries(snap.prices)) {
      const p = ctx.productById.get(Number(key.slice(0, key.indexOf(':'))))
      if (!p) continue
      let h = bySet.get(p.set)
      if (!h) bySet.set(p.set, (h = { dates: ctx.dates, series: {} }))
      const s = (h.series[key] ??= new Array<number | null>(n).fill(null))
      s[i] = point[0]
    }
  })
  for (const [setId, h] of bySet) await ctx.write(`history/${setId}.json`, h)
  ctx.log(`history for ${bySet.size} sets over ${n} days`)
}

/** Biggest risers and fallers per window; floors keep $1 bulk swings out of the list. */
function buildMovers(ctx: BuildContext): Movers {
  const windows = { '1': 2, '7': 3, '30': 4 } as const
  const out: Movers = { windows: { '1': { up: [], down: [] }, '7': { up: [], down: [] }, '30': { up: [], down: [] } } }
  for (const [w, col] of Object.entries(windows) as Array<[keyof typeof windows, 2 | 3 | 4]>) {
    const rows: Mover[] = []
    for (const [key, vp] of ctx.prices) {
      const change = vp[col]
      const market = vp[0]
      if (change == null || market == null || Math.abs(change) < 0.05) continue
      const id = Number(key.slice(0, key.indexOf(':')))
      const p = ctx.productById.get(id)
      if (!p) continue
      const kind = p.kind === 'sealed' ? 'sealed' : 'card'
      if (market < (kind === 'sealed' ? 20 : 5)) continue
      rows.push({ id, name: p.name, set: p.set, variant: key.slice(key.indexOf(':') + 1), kind, market, change: Math.round(change * 1000) / 1000, from: round2(market / (1 + change)) })
    }
    rows.sort((a, b) => b.change - a.change)
    out.windows[w] = { up: rows.filter((r) => r.change > 0).slice(0, 40), down: rows.filter((r) => r.change < 0).reverse().slice(0, 40) }
  }
  return out
}
