import { describe, expect, it } from 'vitest'
import { classifyKind, classifySealed, variantCode } from './classify.ts'
import { scoreDeal } from './deal.ts'
import { countdown, money, pct } from './format.ts'
import { nextOccurrence } from './recurring.ts'

describe('classify', () => {
  it('splits singles, sealed and code cards', () => {
    expect(classifyKind('114/084', 'Ultra Rare')).toBe('card')
    expect(classifyKind(undefined, 'Code Card')).toBe('code')
    expect(classifyKind(undefined, undefined)).toBe('sealed')
    expect(classifyKind(undefined, 'Rare')).toBe('card')
  })
  it('names sealed products', () => {
    expect(classifySealed('Pitch Black Pokemon Center Elite Trainer Box (Exclusive)')).toEqual({ sealed: 'pc-etb', packs: 11 })
    expect(classifySealed('Pitch Black Elite Trainer Box')).toEqual({ sealed: 'etb', packs: 9 })
    expect(classifySealed('Pitch Black Booster Box Case').sealed).toBe('case')
    expect(classifySealed('Pitch Black Booster Box')).toEqual({ sealed: 'booster-box', packs: 36 })
    expect(classifySealed('Pitch Black 3-Pack Blister [Binacle]')).toEqual({ sealed: 'blister', packs: 3 })
    expect(classifySealed('Pitch Black Booster Bundle')).toEqual({ sealed: 'bundle', packs: 6 })
  })
  it('codes variants', () => {
    expect(variantCode('Reverse Holofoil')).toBe('R')
    expect(variantCode('1st Edition Holofoil')).toBe('1H')
  })
})

describe('deal scoring', () => {
  it('calls MSRP on a hot product a steal', () => {
    expect(scoreDeal({ price: 49.99, market: 139, msrp: 49.99, packs: 9 }).verdict).toBe('steal')
  })
  it('flags over market', () => {
    const s = scoreDeal({ price: 150, market: 120 })
    expect(s.verdict).toBe('over')
    expect(s.vsMarket).toBeCloseTo(0.25)
  })
  it('falls back to MSRP when there is no market', () => {
    expect(scoreDeal({ price: 26.94, msrp: 26.94 }).verdict).toBe('good')
    expect(scoreDeal({ price: 40, msrp: 26.94 }).verdict).toBe('over')
  })
  it('computes per pack and flip', () => {
    const s = scoreDeal({ price: 50, market: 100, packs: 10 })
    expect(s.perPack).toBe(5)
    expect(s.flip).toBeCloseTo(100 * (1 - 0.1325) - 0.3 - 1.25 - 50, 2)
  })
})

describe('format', () => {
  it('formats money and percents', () => {
    expect(money(4.49)).toBe('$4.49')
    expect(money(1240)).toBe('$1,240')
    expect(money(null)).toBe('—')
    expect(pct(0.124)).toBe('+12.4%')
    expect(pct(-0.03)).toBe('−3.0%')
  })
  it('counts down', () => {
    const now = Date.parse('2026-10-14T12:00:00Z')
    expect(countdown('2026-10-14T14:14:00Z', now)).toBe('2h 14m')
    expect(countdown('2026-10-17T16:00:00Z', now)).toBe('3d 4h')
    expect(countdown('2026-10-14T11:00:00Z', now)).toBe('closed')
  })
})

describe('recurring', () => {
  const walmart = { weekday: 3, time: '17:00', tz: 'America/New_York', durationMin: 60 }
  it('finds the next Wednesday 5pm Eastern', () => {
    // Tue 2026-10-13 noon UTC -> Wed 2026-10-14 17:00 EDT = 21:00 UTC
    expect(nextOccurrence(walmart, Date.parse('2026-10-13T12:00:00Z')).toISOString()).toBe('2026-10-14T21:00:00.000Z')
  })
  it('keeps the current one while it is open', () => {
    expect(nextOccurrence(walmart, Date.parse('2026-10-14T21:30:00Z')).toISOString()).toBe('2026-10-14T21:00:00.000Z')
  })
  it('rolls to next week after it closes, across the DST change', () => {
    // Nov 1 2026 DST ends: Wed Nov 4 17:00 EST = 22:00 UTC
    expect(nextOccurrence(walmart, Date.parse('2026-10-28T23:00:00Z')).toISOString()).toBe('2026-11-04T22:00:00.000Z')
  })
})

describe('displayName', () => {
  it('drops the appended collector number but keeps printings', async () => {
    const { displayName } = await import('./classify.ts')
    expect(displayName('Charizard ex - 199/165')).toBe('Charizard ex')
    expect(displayName('Mew ex - 205/165 (151 Metal Card)')).toBe('Mew ex (151 Metal Card)')
    expect(displayName('Pikachu ex - TG05/TG30')).toBe('Pikachu ex')
    expect(displayName('Pitch Black Booster Box')).toBe('Pitch Black Booster Box')
    expect(displayName('Ho-Oh - 7/64')).toBe('Ho-Oh')
  })
})
