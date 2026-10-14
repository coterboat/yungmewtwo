import { describe, expect, it } from 'vitest'
import { baseName, matchDetected, matchQuality, normNumber, parseScan, pickVariant, type Detected } from './scan.ts'
import type { IndexRow, SetSummary } from './site.ts'

const set = (id: number, name: string, abbr: string): SetSummary => ({ id, name, abbr, lang: 'EN', released: '2023-10-06', supplemental: false, firstSeen: null, products: 0, cards: 0, sealedCount: 0, value: 0, chase: [] })
const sets = new Map<number, SetSummary>([
  [1, set(1, 'SV: Scarlet & Violet 151', 'MEW')],
  [2, set(2, 'ME05: Pitch Black', 'PBL')],
  [3, set(3, 'SV03: Obsidian Flames', 'OBF')],
])
const rows: IndexRow[] = [
  [10, 'Charizard ex - 006/165', 1, 'c', '006/165', 'Double Rare', 'H', 5, null],
  [11, 'Charizard ex - 199/165', 1, 'c', '199/165', 'Special Illustration Rare', 'H', 260, null],
  [12, 'Mew ex - 205/165', 1, 'c', '205/165', 'Hyper Rare', 'H', 30, null],
  [13, 'Mew ex - 205/165 (151 Metal Card)', 1, 'c', '205/165', 'Double Rare', 'H', 80, null],
  [14, 'Charizard ex - 223/197', 3, 'c', '223/197', 'Special Illustration Rare', 'H', 90, null],
  [15, 'Pitch Black Booster Box', 2, 's', '', '', 'N', 184, null],
  [16, 'Lurantis ex - 004/084', 2, 'c', '004/084', 'Double Rare', 'H', 1.2, null],
]
const read = (p: Partial<Detected>): Detected => ({ name: '', number: '', setCode: '', setName: '', language: 'EN', variant: 'unknown', kind: 'card', quantity: 1, confidence: 'high', note: '', ...p })

describe('normalizing', () => {
  it('strips numbers and printings from names', () => {
    expect(baseName('Mew ex - 205/165 (151 Metal Card)')).toBe('mew ex')
    expect(baseName("Team Rocket's Mewtwo ex")).toBe('team rockets mewtwo ex')
  })
  it('normalizes collector numbers', () => {
    expect(normNumber('114/084')).toBe('114/84')
    expect(normNumber('TG05/TG30')).toBe('TG5/TG30')
    expect(normNumber('SVP 085')).toBe('SVP85')
  })
})

describe('matchDetected', () => {
  it('nails a card by number + name + set code', () => {
    const [best] = matchDetected(read({ name: 'Charizard ex', number: '199/165', setCode: 'MEW' }), rows, sets)
    expect(best.row[0]).toBe(11)
    expect(matchQuality(matchDetected(read({ name: 'Charizard ex', number: '199/165', setCode: 'MEW' }), rows, sets))).toBe('sure')
  })
  it('uses the set code to separate same-name cards when the number is unreadable', () => {
    const [best] = matchDetected(read({ name: 'Charizard ex', setCode: 'OBF' }), rows, sets)
    expect(best.row[0]).toBe(14)
  })
  it('prefers the regular printing over a special one unless the read says otherwise', () => {
    expect(matchDetected(read({ name: 'Mew ex', number: '205/165' }), rows, sets)[0].row[0]).toBe(12)
    expect(matchDetected(read({ name: 'Mew ex', number: '205/165', note: 'metal card' }), rows, sets)[0].row[0]).toBe(13)
  })
  it('matches sealed products by name only among sealed', () => {
    const [best] = matchDetected(read({ name: 'Pitch Black Booster Box', kind: 'sealed' }), rows, sets)
    expect(best.row[0]).toBe(15)
  })
  it('handles leading zeros the card prints', () => {
    expect(matchDetected(read({ name: 'Lurantis ex', number: '4/84' }), rows, sets)[0].row[0]).toBe(16)
  })
  it('returns nothing for a card we cannot place', () => {
    expect(matchDetected(read({ name: 'Totally Unknown' }), rows, sets)).toEqual([])
    expect(matchQuality([])).toBe('none')
  })
  it('flags a name-only read with several similar printings as check, picking the cheaper one', () => {
    const c = matchDetected(read({ name: 'Charizard ex', note: 'number covered by sleeve' }), rows, sets)
    expect(matchQuality(c)).toBe('check')
    expect(c[0].row[0]).toBe(10)
  })
  it('does not treat a word inside another word as a mention of a special printing', () => {
    const extra: IndexRow[] = [
      [20, 'Pikachu (Red Cheeks)', 1, 'c', '058/102', 'Promo', 'H', 430, null],
      [21, 'Pikachu - 025/165', 1, 'c', '025/165', 'Common', 'N', 0.5, null],
    ]
    expect(matchDetected(read({ name: 'Pikachu', note: 'number covered by sleeve' }), extra, sets)[0].row[0]).toBe(21)
  })
})

describe('pickVariant / parseScan', () => {
  it('maps the read variant when the product has it', () => {
    expect(pickVariant('reverse', ['N', 'R'], 'N')).toBe('R')
    expect(pickVariant('reverse', ['H'], 'H')).toBe('H')
    expect(pickVariant('unknown', ['N', 'R'], 'N')).toBe('N')
  })
  it('parses and clamps quantities', () => {
    const cards = parseScan(JSON.stringify({ cards: [{ ...read({ name: 'Mew ex' }), quantity: 0 }, { nope: true }] }))
    expect(cards).toHaveLength(1)
    expect(cards[0].quantity).toBe(1)
  })
})
