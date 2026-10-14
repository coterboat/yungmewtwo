import { describe, expect, it } from 'vitest'
import { boardDealPath } from './dealLink.ts'

describe('boardDealPath', () => {
  it('builds the board prefill link', () => {
    expect(boardDealPath({ productId: 593355, price: 49.99, store: 'Target' })).toBe('/board?new=deal&product=593355&price=49.99&store=Target')
  })
  it('encodes the store and drops empty parts', () => {
    expect(boardDealPath({ productId: 1, price: 5, store: "Dick's & Co" })).toBe('/board?new=deal&product=1&price=5&store=Dick%27s+%26+Co')
    expect(boardDealPath({ productId: 1, price: 5 })).toBe('/board?new=deal&product=1&price=5')
    expect(boardDealPath({ productId: 1, price: 5, store: '  ' })).toBe('/board?new=deal&product=1&price=5')
  })
  it('rounds the price to cents', () => {
    expect(boardDealPath({ productId: 1, price: 12.3456 })).toBe('/board?new=deal&product=1&price=12.35')
  })
})
