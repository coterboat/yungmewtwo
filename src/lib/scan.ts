// Card scanning: what we ask Claude to read off a photo, and how each read card is matched to a
// TCGplayer product in our index. Matching is pure and tested; the API call lives in scanClient.ts.
import type { IndexRow, SetSummary } from './site.ts'

export interface Detected {
  /** English name (Japanese cards translated), e.g. "Charizard ex". */
  name: string
  /** Collector number exactly as printed, e.g. "199/165", "TG05/TG30"; "" if unreadable. */
  number: string
  /** Set code printed by the number, e.g. "MEW", "PBL"; "" if unreadable. */
  setCode: string
  setName: string
  language: 'EN' | 'JP' | 'other'
  variant: 'holo' | 'reverse' | 'normal' | 'unknown'
  kind: 'card' | 'sealed'
  quantity: number
  confidence: 'high' | 'medium' | 'low'
  note: string
}

export const SCAN_SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: "The card's English name as printed (translate Japanese cards), without the collector number." },
          number: { type: 'string', description: 'Collector number exactly as printed, e.g. "199/165", "TG05/TG30", "SVP 085". Empty string if not clearly readable.' },
          setCode: { type: 'string', description: 'Set code printed next to the collector number, e.g. "MEW", "PBL", "PFL". Empty string if not readable.' },
          setName: { type: 'string', description: 'Set name if you recognize it from the set symbol or code, else empty string.' },
          language: { type: 'string', enum: ['EN', 'JP', 'other'] },
          variant: { type: 'string', enum: ['holo', 'reverse', 'normal', 'unknown'] },
          kind: { type: 'string', enum: ['card', 'sealed'] },
          quantity: { type: 'integer', description: 'How many identical copies are visible.' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          note: { type: 'string', description: 'Anything that matters for identifying it (stamp, promo, damage, partly hidden). Empty string if nothing.' },
        },
        required: ['name', 'number', 'setCode', 'setName', 'language', 'variant', 'kind', 'quantity', 'confidence', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['cards'],
  additionalProperties: false,
} as const

export const SCAN_PROMPT = `You catalog Pokémon TCG cards from photos for a collector's inventory app.

List every distinct physical card that is visible, plus any sealed products (booster packs, boxes, tins). For each card:
- name: the card's name as printed (for Japanese cards, give the English card name, e.g. "Charizard ex"). Leave out the collector number.
- number: the collector number printed at the bottom of the card, exactly as printed ("199/165", "TG05/TG30", "SVP 085"). If you cannot read it clearly, use an empty string; never guess digits.
- setCode: the small set code printed beside the number on modern cards ("MEW", "PBL", "PFL", "SSP"), or empty.
- variant: "reverse" when the foil covers the card frame/background but not the artwork; "holo" for holofoil artwork, full arts, illustration rares and other foil-art cards; "normal" for non-foil; "unknown" if you cannot tell.
- quantity: identical copies visible count as one entry with a quantity.
- confidence: how sure you are of the identity, mostly based on whether the number was readable.

Photos may overlap; do not count the same physical card twice. Skip cards that are almost completely hidden, and mention them in a note on a nearby card if useful. Return only cards you can actually see.`

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** "Mew ex - 205/165 (151 Metal Card)" -> "mew ex" */
export function baseName(name: string): string {
  return strip(name.replace(/\([^)]*\)/g, ' ').replace(/\s-\s.*$/, ''))
}

function extras(name: string): string {
  return strip((name.match(/\(([^)]*)\)/g) ?? []).join(' '))
}

/** "114/084" -> "114/84", "TG05/TG30" -> "TG5/TG30", "SVP 085" -> "SVP85". */
export function normNumber(n: string): string {
  return n
    .toUpperCase()
    .replace(/\s+/g, '')
    .split('/')
    .map((part) => part.replace(/^([A-Z]*)0*(\d)/, '$1$2'))
    .join('/')
}

export interface Candidate {
  row: IndexRow
  score: number
}

export type MatchQuality = 'sure' | 'likely' | 'check' | 'none'

/** How much to trust the top candidate: its score, and whether a runner-up is nearly as good. */
export function matchQuality(candidates: Candidate[]): MatchQuality {
  const [best, next] = candidates
  if (!best) return 'none'
  const close = next && best.score - next.score < 10 && next.row[0] !== best.row[0]
  if (best.score >= 100 && !close) return 'sure'
  if (best.score >= 60 && !close) return 'likely'
  return 'check'
}

/** Ranks index rows for one detected card; best first, at most `limit`. */
export function matchDetected(d: Detected, rows: IndexRow[], sets: Map<number, SetSummary> | undefined, limit = 5): Candidate[] {
  const wantNum = d.number ? normNumber(d.number) : ''
  const wantLeft = wantNum.split('/')[0]
  const wantName = baseName(d.name)
  const nameTokens = wantName.split(' ').filter(Boolean)
  const code = d.setCode.trim().toUpperCase()
  const setTokens = strip(d.setName).split(' ').filter((t) => t.length > 2)
  const kind = d.kind === 'sealed' ? 's' : 'c'
  const out: Candidate[] = []

  for (const row of rows) {
    if (row[3] !== kind) continue
    const num = row[4] ? normNumber(row[4]) : ''
    const numHit = wantNum && num === wantNum
    const leftHit = !numHit && wantLeft && num && num.split('/')[0] === wantLeft
    const name = baseName(row[1])
    let nameScore = 0
    if (name === wantName) nameScore = 40
    else if (nameTokens.length) {
      const have = new Set(name.split(' '))
      const overlap = nameTokens.filter((t) => have.has(t)).length / nameTokens.length
      nameScore = overlap * 28
    }
    if (!numHit && !leftHit && nameScore < 14) continue

    let score = nameScore + (numHit ? 60 : leftHit ? 25 : 0)
    const set = sets?.get(row[2])
    if (set) {
      if (code && set.abbr.toUpperCase() === code) score += 25
      if (setTokens.length) {
        const sn = new Set(strip(set.name).split(' '))
        score += (setTokens.filter((t) => sn.has(t)).length / setTokens.length) * 15
      }
    }
    // Special printings ("Metal Card", "Jumbo", "Prerelease") only when the read mentions them.
    const ex = extras(row[1])
      .split(' ')
      .filter((t) => t.length > 2 && !/^\d+$/.test(t) && !name.split(' ').includes(t))
    if (ex.length) {
      const said = new Set(strip(`${d.name} ${d.note}`).split(' '))
      score += ex.some((t) => said.has(t)) ? 8 : -12
    }
    out.push({ row, score })
  }
  // Ties go to the cheaper printing, so an ambiguous read never inflates a collection's value.
  out.sort((a, b) => b.score - a.score || (a.row[7] ?? Infinity) - (b.row[7] ?? Infinity))
  return out.slice(0, limit)
}

/** Variant code to store, given what was read and what the product offers. */
export function pickVariant(read: Detected['variant'], available: string[], fallback: string): string {
  const want = read === 'reverse' ? 'R' : read === 'normal' ? 'N' : read === 'holo' ? 'H' : ''
  if (want && available.includes(want)) return want
  return fallback || available[0] || ''
}

/** Validates the model's JSON (structured outputs should guarantee it; this guards truncation). */
export function parseScan(text: string): Detected[] {
  const v = JSON.parse(text) as { cards?: unknown }
  if (!v || !Array.isArray(v.cards)) throw new Error('The scan came back in an unexpected shape.')
  return v.cards
    .filter((c): c is Detected => !!c && typeof c === 'object' && typeof (c as Detected).name === 'string')
    .map((c) => ({ ...c, quantity: Math.max(1, Math.min(99, Math.round(Number(c.quantity) || 1))) }))
}
