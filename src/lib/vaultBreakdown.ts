// Where the value sits: held market value grouped by set or by rarity, for simple bar lists.
import type { SetSummary } from './site.ts'
import { isHeld } from './vault.ts'
import type { VaultRow } from './vaultFilter.ts'

export interface Slice {
  key: string
  label: string
  value: number
  /** Copies held. */
  units: number
  /** Share of the total held value. */
  share: number
}

/** Held (have + trade) value grouped by set or rarity, biggest first; the tail folds into "Other". */
export function breakdown(rows: VaultRow[], by: 'set' | 'rarity', topN = 6, labelSet: (s: SetSummary) => string = (s) => s.name): Slice[] {
  const groups = new Map<string, { label: string; value: number; units: number }>()
  let total = 0
  for (const r of rows) {
    if (!isHeld(r.item) || r.valued.value == null) continue
    let key: string
    let label: string
    if (by === 'set') {
      key = r.set ? String(r.set.id) : 'unknown'
      label = r.set ? labelSet(r.set) : 'Unknown set'
    } else {
      label = r.product?.rarity ?? (r.product?.kind === 'sealed' ? 'Sealed' : 'Unknown')
      key = label
    }
    const g = groups.get(key)
    if (g) {
      g.value += r.valued.value
      g.units += r.item.qty
    } else groups.set(key, { label, value: r.valued.value, units: r.item.qty })
    total += r.valued.value
  }
  const sorted = [...groups].map(([key, g]) => ({ key, ...g })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
  const head = sorted.slice(0, topN)
  const tail = sorted.slice(topN)
  const out = head.map((g) => ({ ...g, share: total ? g.value / total : 0 }))
  if (tail.length) {
    const value = tail.reduce((s, g) => s + g.value, 0)
    out.push({ key: 'other', label: 'Other', value, units: tail.reduce((s, g) => s + g.units, 0), share: total ? value / total : 0 })
  }
  return out
}
