// Biggest winners and losers in a collection: since you added them (vs what you paid), or over
// the last 7 / 30 days (from the catalog's price changes, once there's enough history).
import { isHeld } from './vault.ts'
import type { VaultRow } from './vaultFilter.ts'

export type MoverWindow = 'added' | '7d' | '30d'

export interface Mover {
  row: VaultRow
  /** Dollar change across the whole lot (qty included). */
  change: number
  /** Fractional change (0.2 = +20%), null when it can't be computed. */
  pct: number | null
}

function moverFor(r: VaultRow, window: MoverWindow): Mover | null {
  if (!isHeld(r.item)) return null
  const v = r.valued
  if (window === 'added') {
    if (v.gain == null) return null
    return { row: r, change: v.gain, pct: v.gainPct }
  }
  const c = window === '7d' ? v.quote?.change7d : v.quote?.change30d
  if (c == null || v.market == null || c <= -1) return null
  const prev = v.market / (1 + c)
  return { row: r, change: (v.market - prev) * r.item.qty, pct: c }
}

export function movers(rows: VaultRow[], window: MoverWindow, n = 3): { up: Mover[]; down: Mover[] } {
  const all = rows.map((r) => moverFor(r, window)).filter((m): m is Mover => m != null)
  return {
    up: all.filter((m) => m.change > 0.005).sort((a, b) => b.change - a.change).slice(0, n),
    down: all.filter((m) => m.change < -0.005).sort((a, b) => a.change - b.change).slice(0, n),
  }
}

/** Total dollar change of what you hold over a window, and how many held lots had data. */
export function periodChange(rows: VaultRow[], window: '7d' | '30d'): { change: number; covered: number } {
  let change = 0
  let covered = 0
  for (const r of rows) {
    const m = moverFor(r, window)
    if (!m) continue
    change += m.change
    covered++
  }
  return { change, covered }
}
