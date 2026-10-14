// How each chain looks in the app (a colored initials badge, never color alone) and which
// section of data/seed/retail.json holds its intel.
export interface ChainMeta {
  chain: string
  initials: string
  bg: string
  /** Text color that stays readable on bg. */
  fg: string
  /** The `retailer` name in retail.json, when there is intel on this chain. */
  intel?: string
}

const light = '#ffffff'
const dark = '#14121c'

export const CHAIN_META: ChainMeta[] = [
  { chain: 'Target', initials: 'TG', bg: '#cc0000', fg: light, intel: 'Target' },
  { chain: 'Walmart', initials: 'WM', bg: '#0071ce', fg: light, intel: 'Walmart' },
  { chain: 'GameStop', initials: 'GS', bg: '#e0451f', fg: light, intel: 'GameStop' },
  { chain: 'Best Buy', initials: 'BB', bg: '#ffe000', fg: dark, intel: 'Best Buy' },
  { chain: "Dick's Sporting Goods", initials: 'DK', bg: '#2e7d32', fg: light, intel: "Dick's Sporting Goods" },
  { chain: 'Barnes & Noble', initials: 'BN', bg: '#0f766e', fg: light, intel: 'Barnes & Noble' },
  { chain: 'Books-A-Million', initials: 'BA', bg: '#8d5a1b', fg: light },
  { chain: 'Costco', initials: 'CO', bg: '#c8102e', fg: light, intel: 'Costco' },
  { chain: "Sam's Club", initials: 'SC', bg: '#3f51b5', fg: light, intel: "Sam's Club" },
  { chain: 'Five Below', initials: '5B', bg: '#e6007e', fg: light, intel: 'Five Below' },
  { chain: 'Walgreens', initials: 'WG', bg: '#e31837', fg: light, intel: 'Walgreens / CVS' },
  { chain: 'CVS', initials: 'CV', bg: '#b3282d', fg: light, intel: 'Walgreens / CVS' },
  { chain: 'Kroger', initials: 'KR', bg: '#1f4e9c', fg: light },
  { chain: 'Local shop', initials: 'LS', bg: '#7c3aed', fg: light, intel: 'Local game stores' },
]

const FALLBACK_BG = '#6b6580'

export function chainMeta(chain: string): ChainMeta {
  const known = CHAIN_META.find((m) => m.chain === chain)
  if (known) return known
  const words = chain.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean)
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase()
  return { chain, initials, bg: FALLBACK_BG, fg: light }
}

/** One retailer's entry in data/seed/retail.json. */
export interface RetailIntel {
  retailer: string
  limits: string[]
  patterns: string[]
  programs: string[]
  notes: string[]
  sources: string[]
  asOf: string
}

/** "https://www.example.com/a/b" becomes "example.com". */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
