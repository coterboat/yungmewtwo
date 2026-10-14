import { describe, expect, it } from 'vitest'
import type { VaultItem } from './user.ts'
import { addItem, lotKey, removeItem, updateItem } from './vaultEdit.ts'

const it_ = (id: string, over: Partial<VaultItem> = {}): VaultItem => ({ id, productId: 1, qty: 1, status: 'have', added: '2026-10-01', ...over })

describe('addItem', () => {
  it('appends a new lot', () => {
    const out = addItem([it_('a')], it_('b', { productId: 2 }))
    expect(out.map((i) => i.id)).toEqual(['a', 'b'])
  })
  it('folds an identical lot into the existing one', () => {
    const out = addItem([it_('a', { cost: 5, condition: 'Near mint' })], it_('b', { cost: 5, condition: 'Near mint', qty: 2 }))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'a', qty: 3 })
  })
  it('keeps lots apart when cost, status, variant, condition or grade differ', () => {
    const base = it_('a', { cost: 5 })
    for (const diff of [{ cost: 6 }, { status: 'trade' as const }, { variant: 'R' }, { condition: 'Damaged' }, { grade: 'PSA 10' }]) {
      expect(addItem([base], it_('b', { cost: 5, ...diff }))).toHaveLength(2)
    }
  })
  it('never folds sold lines', () => {
    expect(addItem([it_('a', { status: 'sold', soldFor: 5 })], it_('b', { status: 'sold', soldFor: 5 }))).toHaveLength(2)
  })
})

describe('updateItem', () => {
  it('patches one item and leaves others', () => {
    const items = [it_('a'), it_('b', { productId: 2 })]
    const out = updateItem(items, 'a', { qty: 4, cost: 9 })
    expect(out[0]).toMatchObject({ qty: 4, cost: 9 })
    expect(out[1]).toBe(items[1])
  })
  it('keeps the quantity at 1 or more', () => {
    expect(updateItem([it_('a')], 'a', { qty: 0 })[0].qty).toBe(1)
    expect(updateItem([it_('a')], 'a', { qty: 2.6 })[0].qty).toBe(3)
  })
  it('clears optional fields set to undefined', () => {
    const out = updateItem([it_('a', { cost: 5, condition: 'Near mint' })], 'a', { cost: undefined, condition: undefined })
    expect('cost' in out[0]).toBe(false)
    expect('condition' in out[0]).toBe(false)
  })
  it('merges into a matching lot after a status change', () => {
    const out = updateItem([it_('a', { cost: 5 }), it_('b', { cost: 5, status: 'trade', qty: 2 })], 'b', { status: 'have' })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'a', qty: 3 })
  })
  it('does nothing for an unknown id', () => {
    const items = [it_('a')]
    expect(updateItem(items, 'zzz', { qty: 9 })).toEqual(items)
  })
})

describe('removeItem', () => {
  it('drops the item', () => {
    expect(removeItem([it_('a'), it_('b')], 'a').map((i) => i.id)).toEqual(['b'])
  })
})

describe('lotKey', () => {
  it('is stable for equal lots', () => {
    expect(lotKey(it_('a', { cost: 5 }))).toBe(lotKey(it_('b', { cost: 5, qty: 7 })))
  })
})
