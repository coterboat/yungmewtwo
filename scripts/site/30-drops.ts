// Release radar data: merges the curated calendar (data/seed/releases.json) with TCGplayer's
// groups, attaches sealed prices, and adds the predictions. Writes public/data/drops.json.
// 32-calendar.ts reads that file back, so this must stay ahead of it in filename order.
import { resolve } from 'node:path'
import {
  NEW_LISTING_DAYS,
  buildReleases,
  daysBetween,
  detectUpcoming,
  holdingUp,
  jpEnLag,
  justListed,
  msrpFor,
  preorderPattern,
  type DropRelease,
  type DropsData,
  type HistorySeries,
  type MsrpSeed,
  type SeedRelease,
  type TcgSealed,
} from '../../src/lib/drops.ts'
import type { SetHistory } from '../../src/lib/site.ts'
import type { Product, SetInfo } from '../../src/lib/types.ts'
import type { BuildContext } from '../build-site-data.ts'
import { PUBLIC_DATA, readJson } from '../lib/io.ts'

const todayUtc = () => new Date().toISOString().slice(0, 10)
/** Past releases keep only what the timeline needs once they are this old. */
const PRUNE_AFTER_DAYS = 21

export async function build(ctx: BuildContext) {
  const today = todayUtc()
  const seed = await ctx.readData<SeedRelease[]>('seed/releases.json', [])
  const msrp = await ctx.readData<MsrpSeed>('seed/msrp.json', { byType: {}, byProduct: {} })

  const sealedOf = (set: SetInfo): TcgSealed[] => {
    const out: TcgSealed[] = []
    for (const p of ctx.catalog.get(set.id) ?? []) {
      if (p.kind !== 'sealed' || !p.sealed || p.sealed === 'case') continue
      let best: [number | null, number | null, number | null] = [null, null, null]
      let bestM = -1
      for (const key of ctx.variantsOf.get(p.id) ?? []) {
        const vp = ctx.prices.get(key)!
        const m = vp[0] ?? vp[1] ?? -1
        if (m > bestM) {
          bestM = m
          best = [vp[0], vp[1], vp[3]]
        }
      }
      const released = p.released ?? set.released
      const price = msrpFor(msrp, { id: p.id, sealed: p.sealed, released }, set.lang)
      out.push({
        id: p.id,
        name: p.name,
        sealed: p.sealed,
        ...(p.packs ? { packs: p.packs } : {}),
        msrp: price?.value ?? null,
        msrpSolid: price?.solid ?? false,
        market: best[0],
        low: best[1],
        presale: !!p.presale && released >= today,
        ...(p.released ? { released: p.released } : {}),
        change7d: best[2],
      })
    }
    return out
  }

  // Groups worth reading products for: the calendar's, anything detected, and anything in pre-sale.
  const sealedByGroup = new Map<number, TcgSealed[]>()
  const withPresale = new Set<number>()
  const need = new Set<number>([...seed.map((r) => r.tcgGroupId).filter((id): id is number => id != null), ...detectUpcoming(ctx.sets, seed, today).map((s) => s.id)])
  for (const set of ctx.sets) {
    const products = ctx.catalog.get(set.id) ?? []
    const hasPresale = products.some((p: Product) => p.kind === 'sealed' && p.presale && p.sealed !== 'case' && (p.released ?? set.released) >= today)
    if (hasPresale) {
      withPresale.add(set.id)
      need.add(set.id)
    }
    if (set.firstSeen && daysBetween(set.firstSeen, today) <= NEW_LISTING_DAYS) need.add(set.id)
  }
  for (const id of need) {
    const set = ctx.setById.get(id)
    if (set) sealedByGroup.set(id, sealedOf(set))
  }

  const releases = buildReleases({ seed, sets: ctx.sets, sealedByGroup, today })

  // "Just listed on TCGplayer": new groups plus anything pre-selling now.
  const listed = justListed(ctx.sets.filter((s) => ctx.catalog.has(s.id)), withPresale, today).map((j) => {
    const all = sealedByGroup.get(j.set.id) ?? sealedOf(j.set)
    const products = (j.isNew && !all.some((p) => p.presale) ? all : all.filter((p) => p.presale)).filter((p) => p.sealed !== 'accessory' || p.market != null)
    return {
      groupId: j.set.id,
      name: j.set.name,
      lang: j.set.lang,
      released: j.set.released,
      isNew: j.isNew,
      listedDaysAgo: j.listedDaysAgo,
      products: products.sort((a, b) => (b.market ?? 0) - (a.market ?? 0)).slice(0, 12),
    }
  })

  // "Recently released: holding up?"
  const holdSource = releases.filter((r) => r.region === 'EN' && r.kind !== 'product' && r.tcgGroupId)
  const holdGroups = new Map<number, TcgSealed[]>()
  const history = new Map<number, HistorySeries>()
  for (const r of holdSource) {
    const gid = r.tcgGroupId!
    const set = ctx.setById.get(gid)
    if (!set || holdGroups.has(gid)) continue
    holdGroups.set(gid, sealedByGroup.get(gid) ?? sealedOf(set))
    const h = await readJson<SetHistory | null>(resolve(PUBLIC_DATA, 'history', `${gid}.json`), null)
    if (!h) continue
    for (const p of holdGroups.get(gid)!) {
      const key = Object.keys(h.series).find((k) => k.startsWith(`${p.id}:`))
      if (key) history.set(p.id, { dates: h.dates, series: h.series[key] })
    }
  }
  const holding = holdingUp({
    releases: holdSource.map((r) => ({ id: r.id, name: r.name, code: r.code, date: r.date, kind: r.kind, tcgGroupId: r.tcgGroupId })),
    products: holdGroups,
    history,
    today,
  })

  const trimmed: DropRelease[] = releases.map((r) => {
    if (!r.date || Date.parse(today) - Date.parse(r.date) <= PRUNE_AFTER_DAYS * 86_400_000) return r
    const { products: _products, notes: _notes, dateNote: _dateNote, ...rest } = r
    return { ...rest, products: [] }
  })

  const data: DropsData = {
    builtAt: new Date().toISOString(),
    today,
    snapshotDate: ctx.latest.date,
    releases: trimmed,
    justListed: listed,
    holding,
    lag: jpEnLag(seed),
    preorder: preorderPattern(seed),
    historyDays: ctx.dates.length,
  }
  await ctx.write('drops.json', data)
  ctx.log(`${releases.length} releases (${releases.filter((r) => r.origin === 'tcgplayer').length} detected), ${listed.length} listed groups, ${holding.length} holding-up rows`)
}
