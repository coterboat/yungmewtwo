// Loaders shared by the news puller and the alert engine (they run outside the site build).
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { NewsFile } from '../../src/lib/dropsNews.ts'
import { watchTargetFor, type WatchTarget } from '../../src/lib/dropsNews.ts'
import type { Person, Post, Recurring, VaultItem, WatchItem } from '../../src/lib/user.ts'
import type { PricePoint, Product, SetInfo, Snapshot } from '../../src/lib/types.ts'
import { DATA, readJson } from './io.ts'

export const NEWS_PATH = resolve(DATA, 'news.json')
export const ALERTS_LOG_PATH = resolve(DATA, 'alerts-log.json')

export const EMPTY_NEWS: NewsFile = { updatedAt: '', sources: {}, items: [] }

export interface CatalogIndex {
  sets: SetInfo[]
  setById: Map<number, SetInfo>
  products: Map<number, Product>
}

/** Every set and non-code product from data/catalog/ (about 60k products; reads in well under a second). */
export async function loadCatalog(): Promise<CatalogIndex> {
  const sets = await readJson<SetInfo[]>(resolve(DATA, 'catalog', 'sets.json'), [])
  const products = new Map<number, Product>()
  for (const s of sets) {
    for (const p of await readJson<Product[]>(resolve(DATA, 'catalog', `${s.id}.json`), [])) if (p.kind !== 'code') products.set(p.id, p)
  }
  return { sets, setById: new Map(sets.map((s) => [s.id, s])), products }
}

export interface UserData {
  people: Person[]
  posts: Post[]
  watch: WatchItem[]
  recurring: Recurring[]
  /** Vault items by person id. */
  vaults: Record<string, VaultItem[]>
}

export async function loadUserData(): Promise<UserData> {
  const people = await readJson<Person[]>(resolve(DATA, 'user', 'people.json'), [])
  const vaults: Record<string, VaultItem[]> = {}
  for (const p of people) vaults[p.id] = await readJson<VaultItem[]>(resolve(DATA, 'user', `vault-${p.id}.json`), [])
  // Vault files for people who aren't in people.json yet still count.
  try {
    for (const f of await readdir(resolve(DATA, 'user'))) {
      const m = /^vault-(.+)\.json$/.exec(f)
      if (m && !vaults[m[1]]) vaults[m[1]] = await readJson<VaultItem[]>(resolve(DATA, 'user', f), [])
    }
  } catch {
    /* no user folder yet */
  }
  return {
    people,
    posts: await readJson<Post[]>(resolve(DATA, 'user', 'posts.json'), []),
    watch: await readJson<WatchItem[]>(resolve(DATA, 'user', 'watch.json'), []),
    recurring: await readJson<Recurring[]>(resolve(DATA, 'user', 'recurring.json'), []),
    vaults,
  }
}

/** Names to look for in the news: every watched product, as matchable targets. */
export function watchTargets(watch: WatchItem[], catalog: CatalogIndex): WatchTarget[] {
  const out: WatchTarget[] = []
  const seen = new Set<number>()
  for (const w of watch) {
    if (seen.has(w.productId)) continue
    seen.add(w.productId)
    const p = catalog.products.get(w.productId)
    const set = p && catalog.setById.get(p.set)
    if (!p || !set) continue
    out.push(watchTargetFor({ id: p.id, name: p.name, kind: p.kind === 'sealed' ? 'sealed' : 'card', sealed: p.sealed, num: p.num }, set.name))
  }
  return out
}

/** Snapshots newest last; the newest `count` days only. */
export async function loadSnapshots(count: number): Promise<Snapshot[]> {
  let dates: string[] = []
  try {
    dates = (await readdir(resolve(DATA, 'snapshots'))).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort()
  } catch {
    return []
  }
  const out: Snapshot[] = []
  for (const d of dates.slice(-count)) out.push(await readJson<Snapshot>(resolve(DATA, 'snapshots', `${d}.json`), { date: d, source: '', prices: {} as Record<string, PricePoint> }))
  return out
}
