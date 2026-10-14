// Filtering and sorting a vault. Every number and chart on the Vault screen is computed from the
// rows that pass these filters, so the page always agrees with itself.
import type { SetSummary, SiteProduct } from './site.ts'
import type { VaultItem } from './user.ts'
import type { ValuedItem } from './vault.ts'

/** One vault line joined to its catalog data. */
export interface VaultRow {
  item: VaultItem
  product?: SiteProduct
  set?: SetSummary
  valued: ValuedItem
}

export type SortKey = 'value' | 'gainPct' | 'gain' | 'newest' | 'number'
export type PriceBand = 'lt5' | '5to25' | '25to100' | 'gt100'

export interface Filters {
  set: number | null
  lang: 'EN' | 'JP' | null
  kind: 'card' | 'sealed' | null
  rarity: string | null
  price: PriceBand | null
  gain: 'win' | 'lose' | null
  sort: SortKey
}

export const DEFAULT_FILTERS: Filters = { set: null, lang: null, kind: null, rarity: null, price: null, gain: null, sort: 'value' }

export const PRICE_BANDS: Array<{ value: PriceBand; label: string; min: number; max: number }> = [
  { value: 'lt5', label: 'Under $5', min: 0, max: 5 },
  { value: '5to25', label: '$5 to $25', min: 5, max: 25 },
  { value: '25to100', label: '$25 to $100', min: 25, max: 100 },
  { value: 'gt100', label: '$100 and up', min: 100, max: Infinity },
]

export const SORT_LABEL: Record<SortKey, string> = {
  value: 'Value',
  gainPct: 'Gain %',
  gain: 'Gain $',
  newest: 'Newest',
  number: 'Set and number',
}

export function isFiltered(f: Filters): boolean {
  return f.set != null || f.lang != null || f.kind != null || f.rarity != null || f.price != null || f.gain != null
}

export function applyFilters(rows: VaultRow[], f: Filters): VaultRow[] {
  const band = f.price ? PRICE_BANDS.find((b) => b.value === f.price) : undefined
  return rows.filter((r) => {
    if (f.set != null && r.product?.set !== f.set) return false
    if (f.lang && r.set?.lang !== f.lang) return false
    if (f.kind && r.product?.kind !== f.kind) return false
    if (f.rarity && r.product?.rarity !== f.rarity) return false
    if (band) {
      const m = r.valued.market
      if (m == null || m < band.min || m >= band.max) return false
    }
    if (f.gain === 'win' && !((r.valued.gain ?? 0) > 0)) return false
    if (f.gain === 'lose' && !((r.valued.gain ?? 0) < 0)) return false
    return true
  })
}

/** Numeric part of a card number: "010/100" -> 10, "TG05" -> 5; sealed and unnumbered sort last. */
function cardNumber(r: VaultRow): number {
  if (r.product?.kind !== 'card') return Number.POSITIVE_INFINITY
  const m = /\d+/.exec(r.product.num ?? '')
  return m ? Number(m[0]) : Number.POSITIVE_INFINITY - 1
}

const desc = (a: number | null, b: number | null) => (b ?? Number.NEGATIVE_INFINITY) - (a ?? Number.NEGATIVE_INFINITY)
const nullsLast = (a: number | null, b: number | null) => {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return b - a
}

export function sortRows(rows: VaultRow[], key: SortKey): VaultRow[] {
  const out = [...rows]
  switch (key) {
    case 'value':
      return out.sort((a, b) => nullsLast(a.valued.value, b.valued.value))
    case 'gainPct':
      return out.sort((a, b) => nullsLast(a.valued.gainPct, b.valued.gainPct))
    case 'gain':
      return out.sort((a, b) => nullsLast(a.valued.gain, b.valued.gain))
    case 'newest':
      return out.sort((a, b) => b.item.added.localeCompare(a.item.added) || a.item.id.localeCompare(b.item.id))
    case 'number':
      return out.sort((a, b) => {
        const ar = a.set ? Date.parse(a.set.released) : Number.NEGATIVE_INFINITY
        const br = b.set ? Date.parse(b.set.released) : Number.NEGATIVE_INFINITY
        if (ar !== br) return desc(ar, br)
        const na = cardNumber(a)
        const nb = cardNumber(b)
        return na === nb ? 0 : na < nb ? -1 : 1
      })
  }
}

export interface FilterOptions {
  sets: Array<{ id: number; name: string; lang: 'EN' | 'JP'; count: number }>
  rarities: Array<{ rarity: string; count: number }>
  langs: Array<'EN' | 'JP'>
}

/** What can actually be filtered on, from the rows in hand (newest sets first). */
export function filterOptions(rows: VaultRow[]): FilterOptions {
  const sets = new Map<number, { id: number; name: string; lang: 'EN' | 'JP'; released: string; count: number }>()
  const rarities = new Map<string, number>()
  const langs = new Set<'EN' | 'JP'>()
  for (const r of rows) {
    if (r.set) {
      const s = sets.get(r.set.id)
      if (s) s.count++
      else sets.set(r.set.id, { id: r.set.id, name: r.set.name, lang: r.set.lang, released: r.set.released, count: 1 })
      langs.add(r.set.lang)
    }
    if (r.product?.rarity) rarities.set(r.product.rarity, (rarities.get(r.product.rarity) ?? 0) + 1)
  }
  return {
    sets: [...sets.values()].sort((a, b) => b.released.localeCompare(a.released) || a.name.localeCompare(b.name)).map(({ id, name, lang, count }) => ({ id, name, lang, count })),
    rarities: [...rarities].map(([rarity, count]) => ({ rarity, count })).sort((a, b) => b.count - a.count || a.rarity.localeCompare(b.rarity)),
    langs: (['EN', 'JP'] as const).filter((l) => langs.has(l)),
  }
}

const KINDS = ['card', 'sealed']
const GAINS = ['win', 'lose']
const SORTS = Object.keys(SORT_LABEL)

export function filtersFromParams(sp: URLSearchParams): Filters {
  const set = Number(sp.get('set'))
  const price = sp.get('price')
  const lang = sp.get('lang')
  const kind = sp.get('kind')
  const gain = sp.get('gain')
  const sort = sp.get('sort')
  return {
    set: sp.get('set') && Number.isInteger(set) && set > 0 ? set : null,
    lang: lang === 'EN' || lang === 'JP' ? lang : null,
    kind: kind && KINDS.includes(kind) ? (kind as Filters['kind']) : null,
    rarity: sp.get('rarity') || null,
    price: PRICE_BANDS.some((b) => b.value === price) ? (price as PriceBand) : null,
    gain: gain && GAINS.includes(gain) ? (gain as Filters['gain']) : null,
    sort: sort && SORTS.includes(sort) ? (sort as SortKey) : DEFAULT_FILTERS.sort,
  }
}

/** Writes the filters into a copy of `base`, dropping anything at its default. */
export function filtersToParams(f: Filters, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base)
  const put = (k: string, v: string | null) => (v == null ? next.delete(k) : next.set(k, v))
  put('set', f.set != null ? String(f.set) : null)
  put('lang', f.lang)
  put('kind', f.kind)
  put('rarity', f.rarity)
  put('price', f.price)
  put('gain', f.gain)
  put('sort', f.sort === DEFAULT_FILTERS.sort ? null : f.sort)
  return next
}
