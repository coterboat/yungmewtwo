// Plain helpers for the Drops screens (kept out of the component files so they hot-reload cleanly).
import { monthLabel, type DropRelease, type ProductRow } from '../../lib/drops.ts'
import { shortDate } from '../../lib/format.ts'

export const KIND_LABEL: Record<DropRelease['kind'], string> = { main: 'Main set', special: 'Special set', product: 'Product' }

/** "Oct 24 – Nov 1", or one date when both ends match. */
export function rangeText(a: string, b: string): string {
  return a === b ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`
}

/** Exact dollars for a list price ($161.64, not $162). */
export const msrpText = (n: number) => `$${n.toFixed(2)}`

const ROW_RANK = ['booster-box', 'etb', 'pc-etb', 'bundle', 'build-battle', 'half-box', 'sleeved-pack', 'pack']

/** The headline products first (box, ETB, Pokémon Center ETB, bundle), the rest in the order we got them. */
export function rankRows(rows: ProductRow[]): ProductRow[] {
  const rank = (r: ProductRow) => {
    const i = ROW_RANK.indexOf(r.sealed ?? '')
    return i < 0 ? ROW_RANK.length : i
  }
  return rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r)
}

/** Seed labels can be long; keep rows readable. */
export function productLabel(r: ProductRow): string {
  return r.label.length > 64 ? `${r.label.slice(0, 61).trimEnd()}...` : r.label
}

/** "Elite Trainer Box (Kyogre promo)" -> "Elite Trainer Box". */
export const bareLabel = (label: string) => label.replace(/\s*\(.*$/, '').replace('Booster Display Box', 'Booster box')

export interface Group {
  key: string
  label: string
  sets: DropRelease[]
  products: DropRelease[]
}

/** Buckets by month; releases without a date go last. */
export function groupByMonth(releases: DropRelease[]): Group[] {
  const groups = new Map<string, Group>()
  for (const r of releases) {
    const key = r.date ? r.date.slice(0, 7) : 'tba'
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { key, label: r.date ? monthLabel(r.date) : 'Date not announced', sets: [], products: [] }))
    ;(r.kind === 'product' ? g.products : g.sets).push(r)
  }
  return [...groups.values()].sort((a, b) => (a.key === 'tba' ? 1 : b.key === 'tba' ? -1 : a.key < b.key ? -1 : 1))
}
