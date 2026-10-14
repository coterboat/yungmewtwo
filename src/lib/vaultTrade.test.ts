import { describe, expect, it } from 'vitest'
import type { VaultItem } from './user.ts'
import { tradeMatches } from './vaultTrade.ts'

const it_ = (id: string, productId: number, status: VaultItem['status'], over: Partial<VaultItem> = {}): VaultItem => ({ id, productId, status, qty: 1, added: '2026-10-01', ...over })

describe('tradeMatches', () => {
  const mine = [it_('m1', 100, 'want'), it_('m2', 200, 'have'), it_('m3', 300, 'want'), it_('m4', 400, 'trade'), it_('m5', 500, 'sold')]
  const theirs = [it_('t1', 100, 'have'), it_('t2', 200, 'want'), it_('t3', 300, 'want'), it_('t4', 400, 'want'), it_('t5', 500, 'want')]
  const m = tradeMatches(mine, theirs)

  it('finds what they have that I want', () => {
    expect(m.theyHave.map((x) => [x.mine.id, x.theirs.id])).toEqual([['m1', 't1']])
  })
  it('finds what I have that they want, trade-flagged first', () => {
    expect(m.iHave.map((x) => [x.mine.id, x.theirs.id])).toEqual([
      ['m4', 't4'],
      ['m2', 't2'],
    ])
    expect(m.iHave[0].tradeFlag).toBe(true)
    expect(m.iHave[1].tradeFlag).toBe(false)
  })
  it('finds collisions where you both want the same card', () => {
    expect(m.bothWant.map((x) => x.productId)).toEqual([300])
  })
  it('ignores sold items', () => {
    expect([...m.theyHave, ...m.iHave, ...m.bothWant].some((x) => x.productId === 500)).toBe(false)
  })
  it('respects variants when both name one', () => {
    const a = [it_('m1', 1, 'want', { variant: 'H' })]
    const b = [it_('t1', 1, 'have', { variant: 'R' }), it_('t2', 1, 'have', { variant: 'H' })]
    expect(tradeMatches(a, b).theyHave.map((x) => x.theirs.id)).toEqual(['t2'])
  })
  it('matches when either side does not name a variant', () => {
    const a = [it_('m1', 1, 'want')]
    const b = [it_('t1', 1, 'have', { variant: 'R' })]
    expect(tradeMatches(a, b).theyHave).toHaveLength(1)
  })
  it('lists a wanted card once even if the other side holds several lots', () => {
    const a = [it_('m1', 1, 'want')]
    const b = [it_('t1', 1, 'have', { qty: 1 }), it_('t2', 1, 'trade', { qty: 2 })]
    const out = tradeMatches(a, b).theyHave
    expect(out).toHaveLength(1)
    expect(out[0].theirs.id).toBe('t2')
  })
  it('is empty when nothing lines up', () => {
    const e = tradeMatches([it_('m', 1, 'have')], [it_('t', 2, 'want')])
    expect(e.theyHave).toEqual([])
    expect(e.iHave).toEqual([])
    expect(e.bothWant).toEqual([])
  })
})
