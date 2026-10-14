// Odds in words you can picture: "1 in 80 packs" becomes "about 2.2 booster boxes", and a
// probability of profit becomes "61 out of 100 lose money". Pure text helpers for the EV tool.
import type { SealedType } from './types.ts'

export interface Unit {
  one: string
  many: string
}

const UNITS: Partial<Record<SealedType, Unit>> = {
  'booster-box': { one: 'booster box', many: 'booster boxes' },
  'half-box': { one: 'half box', many: 'half boxes' },
  etb: { one: 'ETB', many: 'ETBs' },
  'pc-etb': { one: 'Pokémon Center ETB', many: 'Pokémon Center ETBs' },
  bundle: { one: 'booster bundle', many: 'booster bundles' },
  pack: { one: 'pack', many: 'packs' },
  'sleeved-pack': { one: 'pack', many: 'packs' },
  blister: { one: 'blister', many: 'blisters' },
  tin: { one: 'tin', many: 'tins' },
  case: { one: 'case', many: 'cases' },
}

export function sealedUnit(type: SealedType | undefined): Unit {
  return (type && UNITS[type]) || { one: 'product', many: 'products' }
}

/** 4, 2.2, 35: whole numbers from 10 up, one decimal below (dropping a trailing .0). */
function fmt(n: number): string {
  if (n >= 10) return String(Math.round(n))
  return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '')
}

/** What "1 in `perPack` packs" means for a product holding `packs` packs. */
export function expectOneText(perPack: number, packs: number, unit: Unit): string {
  if (!(packs > 0) || !(perPack > 0)) return ''
  const r = perPack / packs
  if (r < 0.85) {
    const per = fmt(1 / r)
    return `about ${per} per ${unit.one}`
  }
  const shown = fmt(r)
  return `about ${shown} ${shown === '1' ? unit.one : unit.many} to expect one`
}

/** A share (0..1) as a count out of 100. */
export function ofHundred(p: number): number {
  return Math.max(0, Math.min(100, Math.round(p * 100)))
}

/** "Out of 100 booster boxes like this, 61 lose money" from the chance of coming out ahead. */
export function outOf100Text(pProfit: number, unit: Unit): string {
  const lose = ofHundred(1 - pProfit)
  const tail = lose === 0 ? 'none lose money' : lose === 100 ? 'all lose money' : `${lose} lose money`
  return `Out of 100 ${unit.many} like this, ${tail}`
}
