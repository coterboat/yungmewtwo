// Outbound research links for a product: where to sanity-check a price before buying or selling.
import { productUrl } from './classify.ts'
import { displayName } from './market.ts'

export interface ResearchInput {
  id: number
  name: string
  num?: string
  /** Set name, already tidied (no "ME05:" prefix). */
  set: string
  kind: 'card' | 'sealed'
  lang: 'EN' | 'JP'
}

export interface ResearchLink {
  id: 'tcgplayer' | 'ebay' | 'pricecharting' | 'cardmarket'
  label: string
  hint: string
  url: string
}

/** The text people would type to find this exact product: "<name> <number> <set>". */
export function researchQuery({ name, num, set, kind, lang }: Pick<ResearchInput, 'name' | 'num' | 'set' | 'kind' | 'lang'>): string {
  let n = displayName(name)
  n = n.replace(/\s*[([]\s*#?\d+\s*[)\]]/g, '') // "(74)", "[#14]"
  n = n.replace(/[()[\]]/g, '').replace(/\s+/g, ' ').trim()
  const parts = [n]
  if (kind === 'card' && num && !n.includes(num)) parts.push(num)
  if (set && !n.toLowerCase().includes(set.toLowerCase())) parts.push(set)
  if (lang === 'JP') parts.push('japanese')
  return parts.join(' ')
}

export function researchLinks(p: ResearchInput): ResearchLink[] {
  const q = encodeURIComponent(researchQuery(p))
  const links: ResearchLink[] = [
    { id: 'tcgplayer', label: 'TCGplayer', hint: 'Listings and sellers', url: productUrl(p.id) },
    { id: 'ebay', label: 'eBay sold', hint: 'What it actually sold for', url: `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1` },
    { id: 'pricecharting', label: 'PriceCharting', hint: 'Price history and graded', url: `https://www.pricecharting.com/search-products?q=${encodeURIComponent(`pokemon ${researchQuery(p)}`)}&type=prices` },
  ]
  if (p.kind === 'card' && p.lang === 'EN') {
    links.push({ id: 'cardmarket', label: 'Cardmarket', hint: 'European prices', url: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(researchQuery({ ...p, set: '' }))}` })
  }
  return links
}
