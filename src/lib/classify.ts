import type { ProductKind, SealedType, Variant } from './types.ts'

// TCGCSV puts card facts in extendedData; sealed products have no Number.
// "Code Card" items are digital codes, and a few singles lack a Number, so Rarity breaks the tie.
export function classifyKind(num: string | undefined, rarity: string | undefined): ProductKind {
  if (rarity === 'Code Card') return 'code'
  if (num || rarity) return 'card'
  return 'sealed'
}

// Order matters: the most specific names come first.
const SEALED_RULES: Array<[RegExp, SealedType, number | undefined]> = [
  [/\bcase\b/i, 'case', undefined],
  [/pok[eé]mon center elite trainer box/i, 'pc-etb', 11],
  [/elite trainer box/i, 'etb', 9],
  [/half booster box/i, 'half-box', 18],
  [/booster (box|display)/i, 'booster-box', 36],
  [/booster bundle/i, 'bundle', 6],
  [/art bundle/i, 'art-bundle', 4],
  [/sleeved booster/i, 'sleeved-pack', 1],
  [/3[- ]pack blister/i, 'blister', 3],
  [/booster pack/i, 'pack', 1],
  [/build (&|and) battle/i, 'build-battle', 4],
  [/ultra[- ]premium collection/i, 'upc', undefined],
  [/premium collection/i, 'premium-collection', undefined],
  [/\btin\b/i, 'tin', undefined],
  [/blister/i, 'blister', undefined],
  [/(battle|theme|league battle|starter) deck/i, 'deck', undefined],
  [/sleeves|binder|portfolio|playmat|deck box|card box|dice|coin|pin\b|figure/i, 'accessory', undefined],
  [/collection|box/i, 'collection', undefined],
]

export function classifySealed(name: string): { sealed: SealedType; packs?: number } {
  for (const [re, sealed, packs] of SEALED_RULES) {
    if (re.test(name)) return packs ? { sealed, packs } : { sealed }
  }
  return { sealed: 'other' }
}

const VARIANT_CODES: Record<string, Variant> = {
  Normal: 'N',
  Holofoil: 'H',
  'Reverse Holofoil': 'R',
  '1st Edition Holofoil': '1H',
  '1st Edition Normal': '1N',
  '1st Edition': '1N',
  'Unlimited Holofoil': 'UH',
  Unlimited: 'U',
}

export function variantCode(subTypeName: string): Variant {
  return VARIANT_CODES[subTypeName] ?? subTypeName.replace(/[^A-Za-z0-9]/g, '')
}

export const VARIANT_LABELS: Record<string, string> = {
  N: 'Normal',
  H: 'Holofoil',
  R: 'Reverse Holo',
  '1H': '1st Ed. Holo',
  '1N': '1st Edition',
  UH: 'Unlimited Holo',
  U: 'Unlimited',
}

export function variantLabel(code: Variant): string {
  return VARIANT_LABELS[code] ?? code
}

export function productImage(id: number, size: 200 | 400 = 200): string {
  return `https://tcgplayer-cdn.tcgplayer.com/product/${id}_${size}w.jpg`
}

export function productUrl(id: number): string {
  return `https://www.tcgplayer.com/product/${id}`
}
