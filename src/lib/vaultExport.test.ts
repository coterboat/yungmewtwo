import { describe, expect, it } from 'vitest'
import type { SetSummary, SiteProduct } from './site.ts'
import type { VaultItem } from './user.ts'
import { quoteFor, valueItem } from './vault.ts'
import type { VaultRow } from './vaultFilter.ts'
import { CSV_HEADER, vaultCsv, vaultCsvFilename } from './vaultExport.ts'

const set = { id: 1, name: 'ME05: Pitch Black', abbr: 'PBL', lang: 'EN', released: '2026-09-26', supplemental: false, firstSeen: null, products: 0, cards: 0, sealedCount: 0, value: 0, chase: [] } as SetSummary
const product: SiteProduct = { id: 99, name: 'Mewtwo ex - 150/132, "Alt"', set: 1, kind: 'card', num: '150/132', rarity: 'Special Illustration Rare', v: { H: [100, 90, null, null, null] } }
const row = (item: VaultItem): VaultRow => ({ item, product, set, valued: valueItem(item, quoteFor(product, item.variant)) })

describe('vaultCsv', () => {
  it('has a header and one line per item, with money as plain numbers', () => {
    const csv = vaultCsv([row({ id: 'a', productId: 99, qty: 2, status: 'have', cost: 40, condition: 'Near mint', added: '2026-10-01' })], 'Alex')
    const lines = csv.trimEnd().split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(CSV_HEADER.join(','))
    expect(lines[1]).toContain('Alex,have,99,')
    expect(lines[1]).toContain('"Mewtwo ex - 150/132, ""Alt"""')
    expect(lines[1]).toContain(',2,40,80,100,200,120,') // qty, cost each, cost total, market each, value, gain
  })
  it('leaves unknowns blank and shows sold prices', () => {
    const csv = vaultCsv([row({ id: 'b', productId: 99, qty: 1, status: 'sold', soldFor: 75, added: '2026-10-01' })], 'Alex')
    // The name contains a comma, so count cells from the end of the line.
    const cells = csv.trimEnd().split('\r\n')[1].split(',')
    const fromEnd = (col: string) => cells[cells.length - (CSV_HEADER.length - CSV_HEADER.indexOf(col))]
    expect(fromEnd('sold for each')).toBe('75')
    expect(fromEnd('cost each')).toBe('')
  })
  it('still writes a row for a product that is not in the catalog', () => {
    const csv = vaultCsv([{ item: { id: 'c', productId: 5, qty: 1, status: 'want', added: '2026-10-01' }, valued: valueItem({ id: 'c', productId: 5, qty: 1, status: 'want', added: '2026-10-01' }, undefined) }], 'Alex')
    expect(csv.trimEnd().split('\r\n')[1]).toContain('Alex,want,5,Product 5')
  })
})

describe('vaultCsvFilename', () => {
  it('names the file after the person and day', () => {
    expect(vaultCsvFilename('Alex Smith', new Date('2026-10-14T12:00:00Z'))).toBe('yungmewtwo-vault-alex-smith-2026-10-14.csv')
  })
})
