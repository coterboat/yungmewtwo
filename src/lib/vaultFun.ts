// Tangible equivalents: "your vault is about 3.4 Pitch Black booster boxes". Values are easier to
// feel as things you could buy at MSRP. The units come from the real sealed catalog and the
// MSRP seed, so they stay current as new sets come out.
import type { SealedRow } from './site.ts'
import type { SealedType } from './types.ts'

export interface EquivUnit {
  id: string
  one: string
  many: string
  /** MSRP of one. */
  price: number
}

const ORDER: Array<{ id: SealedType; one: string; many: string }> = [
  { id: 'booster-box', one: 'booster box', many: 'booster boxes' },
  { id: 'etb', one: 'ETB', many: 'ETBs' },
  { id: 'bundle', one: 'booster bundle', many: 'booster bundles' },
  { id: 'pack', one: 'pack', many: 'packs' },
]

/** 3.4, 46, 2: one decimal under 10, whole numbers above, no trailing .0. */
export function countText(n: number): string {
  if (n >= 10) return String(Math.round(n))
  return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '')
}

/**
 * Express `value` in the biggest unit of which you could buy at least one. Returns null for values
 * under one pack (or nothing to compare with). `units` should be ordered biggest first.
 */
export function pickEquivalent(value: number, units: EquivUnit[]): { unit: EquivUnit; count: number; text: string } | null {
  if (!(value > 0)) return null
  const sorted = [...units].sort((a, b) => b.price - a.price)
  const unit = sorted.find((u) => value / u.price >= 0.95)
  if (!unit) return null
  const count = value / unit.price
  const shown = countText(count)
  return { unit, count, text: `${shown} ${shown === '1' ? unit.one : unit.many}` }
}

/**
 * The units to measure with: boxes, ETBs, bundles and packs at MSRP, named after the newest
 * released English set that has a booster box ("Pitch Black booster box"). MSRP comes from the
 * catalog row, else the by-type seed; units with no MSRP are left out.
 */
export function buildUnits(rows: SealedRow[], setName: (setId: number) => string, byType: Record<string, { msrp: number | null }>, today: string): EquivUnit[] {
  const released = rows.filter((r) => r.lang === 'EN' && !r.presale && r.released && r.released <= today)
  const anchor = released.filter((r) => r.sealed === 'booster-box').sort((a, b) => (b.released ?? '').localeCompare(a.released ?? ''))[0]?.set
  const prefix = anchor != null ? `${setName(anchor)} ` : ''
  const out: EquivUnit[] = []
  for (const u of ORDER) {
    const row = anchor != null ? released.find((r) => r.set === anchor && r.sealed === u.id) : undefined
    const price = row?.msrp ?? byType[u.id]?.msrp ?? null
    if (!price) continue
    out.push({ id: u.id, one: `${prefix}${u.one}`, many: `${prefix}${u.many}`, price })
  }
  return out
}
