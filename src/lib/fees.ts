// Selling-fee estimates used for flip math. Rough 2026 numbers; adjust here, everything follows.
export interface Platform {
  id: 'tcgplayer' | 'ebay' | 'local'
  label: string
  /** Share of the sale price taken (marketplace + payment processing). */
  rate: number
  /** Flat fee per order. */
  fixed: number
  /** Typical shipping cost the seller eats on a single card / small package. */
  ship: number
  note: string
}

export const PLATFORMS: Platform[] = [
  { id: 'tcgplayer', label: 'TCGplayer', rate: 0.1325, fixed: 0.3, ship: 1.25, note: '10.75% marketplace + 2.5% processing + $0.30; ~$1.25 plain-envelope shipping (estimate)' },
  { id: 'ebay', label: 'eBay', rate: 0.1325, fixed: 0.4, ship: 4.5, note: '13.25% final value fee + $0.40; ~$4.50 tracked shipping (estimate)' },
  { id: 'local', label: 'Local / cash', rate: 0, fixed: 0, ship: 0, note: 'Card show or local sale, no fees (often ~10% under market to close)' },
]

/** What you keep after fees and shipping from selling at `price` on `platform`. */
export function netProceeds(price: number, platform: Platform = PLATFORMS[0]): number {
  return Math.max(0, price * (1 - platform.rate) - platform.fixed - platform.ship)
}
