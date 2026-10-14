// CSV export of a vault: one line per lot, every status, plain numbers (no $ signs) so a
// spreadsheet can sum them. Cost and sold prices are per item, as stored.
import { toCsv } from './vault.ts'
import type { VaultRow } from './vaultFilter.ts'

export const CSV_HEADER = ['person', 'status', 'product id', 'name', 'set', 'number', 'rarity', 'printing', 'qty', 'cost each', 'cost total', 'market each', 'market value', 'gain', 'sold for each', 'condition', 'grade', 'note', 'added']

export function vaultCsv(rows: VaultRow[], person: string): string {
  const round = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100) / 100)
  return toCsv(
    CSV_HEADER,
    rows.map((r) => {
      const { item, product, set, valued } = r
      return [
        person,
        item.status,
        item.productId,
        product?.name ?? `Product ${item.productId}`,
        set?.name ?? '',
        product?.num ?? '',
        product?.rarity ?? '',
        item.variant ?? valued.quote?.variant ?? '',
        item.qty,
        round(item.cost),
        round(valued.costTotal),
        round(valued.market),
        round(valued.value),
        round(valued.gain),
        round(item.soldFor),
        item.condition ?? '',
        item.grade ?? '',
        item.note ?? '',
        item.added,
      ]
    }),
  )
}

export function vaultCsvFilename(person: string, now = new Date()): string {
  const slug = person.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vault'
  return `yungmewtwo-vault-${slug}-${now.toISOString().slice(0, 10)}.csv`
}
