import { describe, expect, it } from 'vitest'
import {
  addDays,
  attachProducts,
  buildReleases,
  daysBetween,
  detectUpcoming,
  earlyAndLate,
  headlineRows,
  heroRelease,
  holdingUp,
  jpEnLag,
  justListed,
  monthLabel,
  msrpFor,
  predictEnglish,
  predictPreorder,
  preorderPattern,
  preorderStatus,
  releaseStage,
  type SeedRelease,
  type TcgSealed,
} from './drops.ts'
import type { SetInfo } from './types.ts'

function seed(p: Partial<SeedRelease> & { id: string }): SeedRelease {
  return { name: p.id, region: 'EN', kind: 'main', date: null, confidence: 'high', prerelease: null, preorder: null, products: [], ...p }
}

const jp = (id: string, date: string, mapsTo?: string) => seed({ id, region: 'JP', date, mapsTo })
const en = (id: string, date: string | null, mapsTo?: string, preorder?: string, kind: SeedRelease['kind'] = 'main') =>
  seed({ id, region: 'EN', date, mapsTo, kind, preorder: preorder ? { date: preorder, where: 'Pokémon Center' } : null })

// The real pairs, trimmed.
const PAIRS: SeedRelease[] = [
  jp('jp1', '2025-08-01', 'en1'),
  en('en1', '2025-09-26', 'jp1', '2025-07-15'),
  jp('jp2', '2025-09-26', 'en2'),
  en('en2', '2025-11-14', 'jp2', '2025-09-15'),
  jp('jp3', '2026-01-23', 'en3'),
  en('en3', '2026-03-27', 'jp3', '2026-01-08'),
  jp('jp4', '2026-03-13', 'en4'),
  en('en4', '2026-05-22', 'jp4', '2026-04-13'),
  jp('jp5', '2026-05-22', 'en5'),
  en('en5', '2026-07-17', 'jp5', '2026-06-10'),
  jp('jp6', '2026-07-31', 'en6'),
  en('en6', '2026-11-06', 'jp6', '2026-09-30'),
  // Same-day global release: not a lag.
  jp('jp30', '2026-09-16', 'en30'),
  en('en30', '2026-09-16', 'jp30', undefined, 'special'),
]

describe('dates', () => {
  it('does day math in UTC', () => {
    expect(daysBetween('2026-10-14', '2026-11-06')).toBe(23)
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(monthLabel('2026-11-06')).toBe('November 2026')
  })
})

describe('JP to EN lag', () => {
  it('takes median and range from real pairs and skips same-day releases', () => {
    const lag = jpEnLag(PAIRS)!
    expect(lag.n).toBe(6)
    expect(lag.median).toBe(60)
    expect(lag.min).toBe(49)
    expect(lag.max).toBe(98)
    expect(lag.pairs.map((p) => p.days)).toEqual([56, 49, 63, 70, 56, 98])
  })
  it('returns null without pairs', () => {
    expect(jpEnLag([jp('a', '2026-01-01')])).toBeNull()
  })
  it('predicts an English window for a Japanese release', () => {
    const lag = jpEnLag(PAIRS)!
    const p = predictEnglish('2026-11-27', lag)
    expect(p.likely).toBe(addDays('2026-11-27', lag.median))
    expect(p.from <= p.likely && p.likely <= p.to).toBe(true)
    expect(p.min).toBe(addDays('2026-11-27', 49))
    expect(p.max).toBe(addDays('2026-11-27', 98))
    expect(p.basis).toMatch(/6 pairs/)
    expect(p.basis).toMatch(/49–98 days/)
  })
})

describe('pre-order pattern', () => {
  it('weights the most recent main sets', () => {
    const pat = preorderPattern(PAIRS)!
    expect(pat.recent).toBe(3)
    // en6 Sep 30 (37, Wed), en5 Jun 10 (37, Wed), en4 Apr 13 (39, Mon)
    expect(pat.leadMin).toBe(37)
    expect(pat.leadMax).toBe(39)
    expect(pat.weekday).toBe(3)
    expect(pat.basis).toBe('last 3 sets opened 37–39 days out, mostly on Wednesdays')
    expect(pat.earlier).toEqual({ min: 60, max: 78, n: 3 })
  })
  it('needs at least two sets to call a pattern', () => {
    expect(preorderPattern([en('x', '2026-05-01', undefined, '2026-03-25')])).toBeNull()
  })
  it('predicts a window and the likely Wednesday', () => {
    const pat = preorderPattern(PAIRS)!
    // 2027-03-05 minus 39..37 days = Jan 25 (Mon) .. Jan 27 (Wed)
    const p = predictPreorder('2027-03-05', pat)
    expect(p.from).toBe('2027-01-25')
    expect(p.to).toBe('2027-01-27')
    expect(p.likely).toBe('2027-01-27')
    expect(p.weekday).toBe(3)
    expect(p.basis).toBe(pat.basis)
  })
})

describe('upcoming groups', () => {
  const set = (o: Partial<SetInfo> & { id: number }): SetInfo => ({ name: `Set ${o.id}`, abbr: 'X', lang: 'EN', released: '2026-12-01', supplemental: false, firstSeen: null, ...o })
  it('finds future, non-supplemental groups the seed does not know', () => {
    const sets = [
      set({ id: 1, released: '2026-12-04' }),
      set({ id: 2, released: '2026-12-04', supplemental: true }),
      set({ id: 3, released: '2026-10-14' }), // crawl date, not a real release
      set({ id: 4, released: '2026-11-06' }), // in the seed
      set({ id: 5, released: '2026-09-01' }),
    ]
    const known = [seed({ id: 'dlr', tcgGroupId: 4, date: '2026-11-06' })]
    expect(detectUpcoming(sets, known, '2026-10-14').map((s) => s.id)).toEqual([1])
  })
  it('lists groups first seen in the last 14 days, and ones with presale products', () => {
    const sets = [set({ id: 1, firstSeen: '2026-10-10' }), set({ id: 2, firstSeen: '2026-09-01' }), set({ id: 3, firstSeen: null }), set({ id: 4, firstSeen: '2026-10-01', supplemental: true })]
    const presale = new Set([2])
    const out = justListed(sets, presale, '2026-10-14')
    expect(out.map((j) => [j.set.id, j.isNew])).toEqual([
      [1, true],
      [4, true],
      [2, false],
    ])
  })
})

describe('msrp', () => {
  const msrp = {
    byType: { etb: { msrp: 49.99 }, 'booster-box': { msrp: 161.64 }, collection: { msrp: 14.99 } },
    byProduct: { '5': { msrp: 59.99, confidence: 'high' }, '6': { msrp: 9.99, confidence: 'low' } },
  }
  it('trusts the standard prices only for modern EN sealed', () => {
    expect(msrpFor(msrp, { id: 1, sealed: 'etb', released: '2026-11-06' }, 'EN')).toEqual({ value: 49.99, solid: true })
    expect(msrpFor(msrp, { id: 1, sealed: 'etb', released: '2023-11-06' }, 'EN')).toBeNull()
    expect(msrpFor(msrp, { id: 1, sealed: 'etb', released: '2026-11-06' }, 'JP')).toBeNull()
  })
  it('marks type averages for odd products as rough', () => {
    expect(msrpFor(msrp, { id: 1, sealed: 'collection', released: '2026-11-06' }, 'EN')).toEqual({ value: 14.99, solid: false })
    expect(msrpFor(msrp, { id: 5, sealed: 'collection', released: '2026-11-06' }, 'EN')).toEqual({ value: 59.99, solid: true })
    expect(msrpFor(msrp, { id: 6, sealed: 'tin', released: '2026-11-06' }, 'EN')).toEqual({ value: 9.99, solid: false })
  })
})

const sealed = (o: Partial<TcgSealed> & { id: number; sealed: TcgSealed['sealed'] }): TcgSealed => ({
  name: `p${o.id}`,
  msrp: null,
  msrpSolid: false,
  market: null,
  low: null,
  presale: false,
  change7d: null,
  ...o,
})

describe('products', () => {
  it('joins seed MSRPs to TCGplayer prices by product type and flags the pre-order premium', () => {
    const rows = attachProducts(
      [
        { type: 'Booster Display Box', msrp: 161.64, packs: 36 },
        { type: 'Pokémon Center ETB (2 Kyogre promos)', msrp: 59.99, packs: 11 },
        { type: 'Elite Trainer Box (Kyogre promo)', msrp: 49.99, packs: 9 },
        { type: 'Half Booster Display Box', msrp: null, packs: 18 },
      ],
      [
        sealed({ id: 1, sealed: 'booster-box', name: 'DLR Booster Box', msrp: 161.64, msrpSolid: true, market: 249.43, presale: true }),
        sealed({ id: 2, sealed: 'etb', name: 'DLR ETB', msrp: 49.99, msrpSolid: true, market: 120.55, presale: true }),
        sealed({ id: 3, sealed: 'pc-etb', name: 'DLR PC ETB', market: 457.21, presale: true }),
        sealed({ id: 4, sealed: 'bundle', name: 'DLR Bundle', msrp: 26.94, msrpSolid: true, market: 72.64, presale: true }),
      ],
    )
    expect(rows.map((r) => [r.label, r.tcg?.id ?? null])).toEqual([
      ['Booster Display Box', 1],
      ['Pokémon Center ETB (2 Kyogre promos)', 3],
      ['Elite Trainer Box (Kyogre promo)', 2],
      ['Half Booster Display Box', null],
      ['DLR Bundle', 4],
    ])
    expect(rows[0].premium).toBeCloseTo(249.43 / 161.64 - 1, 5)
    // MSRP comes from the seed row when TCGplayer has none.
    expect(rows[1].msrp).toBe(59.99)
    expect(rows[1].premium).toBeCloseTo(457.21 / 59.99 - 1, 5)
  })
  it('tells blisters apart by pack count and name', () => {
    const rows = attachProducts(
      [
        { type: '3-Pack Blister', msrp: 13.99, packs: 3 },
        { type: 'Single-pack blister', msrp: 5.49, packs: 1 },
      ],
      [
        sealed({ id: 1, sealed: 'blister', name: 'Delta Reign Premium Checklane Blister [Ampharos Line]' }),
        sealed({ id: 2, sealed: 'blister', name: 'Delta Reign Single Pack Blister [Spitzee]', market: 23.69 }),
        sealed({ id: 3, sealed: 'blister', name: 'Delta Reign 3 Pack Blister [Seel]', packs: 3, market: 44.24 }),
      ],
    )
    expect(rows.map((r) => r.tcg?.id)).toEqual([3, 2, 1])
  })
  it('does not call a premium off a rough MSRP', () => {
    const rows = attachProducts([], [sealed({ id: 9, sealed: 'upc', msrp: 179.99, msrpSolid: false, market: 561, presale: true })])
    expect(rows[0].premium).toBeNull()
  })
})

describe('merged releases', () => {
  const today = '2026-10-14'
  const sets: SetInfo[] = [
    { id: 24831, name: 'ME06: Delta Reign', abbr: 'DLR', lang: 'EN', released: '2026-11-06', supplemental: false, firstSeen: null },
    { id: 777, name: 'ME08: Brand New Set', abbr: 'BNS', lang: 'EN', released: '2027-01-15', supplemental: false, firstSeen: '2026-10-12' },
  ]
  const releases: SeedRelease[] = [
    ...PAIRS.filter((r) => r.id !== 'en6'),
    seed({ id: 'en6', date: '2026-11-06', mapsTo: 'jp6', tcgGroupId: 24831, preorder: { date: '2026-09-30', where: 'Pokémon Center' }, prerelease: { start: '2026-10-24', end: '2026-11-01' } }),
    seed({ id: 'jp7', region: 'JP', date: '2026-11-27', mapsTo: 'en7', confidence: 'med' }),
    seed({ id: 'en7', date: null, mapsTo: 'jp7', confidence: 'low' }),
  ]
  const out = buildReleases({ seed: releases, sets, sealedByGroup: new Map(), today })
  const byId = new Map(out.map((r) => [r.id, r]))

  it('keeps the seed and adds groups detected on TCGplayer', () => {
    const d = byId.get('tcg-777')!
    expect(d.origin).toBe('tcgplayer')
    expect(d.date).toBe('2027-01-15')
    expect(d.confidence).toBe('med')
    // dated, no pre-order yet: gets a predicted window
    expect(d.preorderPrediction?.likely).toBe('2026-12-09')
  })
  it('does not predict a pre-order for a set that already has one', () => {
    expect(byId.get('en6')!.preorderPrediction).toBeUndefined()
  })
  it('pairs Japanese and English releases both ways with the real lag', () => {
    expect(byId.get('en6')!.pair).toMatchObject({ id: 'jp6', region: 'JP', date: '2026-07-31', lagDays: 98 })
    expect(byId.get('jp6')!.pair).toMatchObject({ id: 'en6', region: 'EN', lagDays: 98 })
  })
  it('predicts English windows for undated pairs and for Japanese sets without an English date', () => {
    expect(byId.get('en7')!.englishPrediction?.likely).toBe(addDays('2026-11-27', 60))
    expect(byId.get('jp7')!.englishPrediction?.likely).toBe(addDays('2026-11-27', 60))
    expect(byId.get('en6')!.englishPrediction).toBeUndefined()
  })
  it('picks the next English set for the hero', () => {
    expect(heroRelease(out, today)?.id).toBe('en6')
    expect(heroRelease(out, '2026-11-07')?.id).toBe('tcg-777')
    expect(heroRelease(out.filter((r) => r.region === 'JP'), today)).toBeUndefined()
  })
})

describe('holding up', () => {
  it('compares market to MSRP and tracks the move since we started watching', () => {
    const rows = holdingUp({
      releases: [
        { id: 'en5', name: 'Pitch Black', code: 'ME05', date: '2026-07-17', kind: 'main', tcgGroupId: 5 },
        { id: 'old', name: 'Old', code: 'ME01', date: '2024-01-01', kind: 'main', tcgGroupId: 6 },
      ],
      products: new Map([
        [5, [sealed({ id: 1, sealed: 'booster-box', msrp: 161.64, msrpSolid: true, market: 183.73 }), sealed({ id: 2, sealed: 'etb', msrp: 49.99, msrpSolid: true, market: 78.81 }), sealed({ id: 3, sealed: 'tin', market: 20 })]],
        [6, [sealed({ id: 9, sealed: 'etb', msrp: 49.99, msrpSolid: true, market: 90 })]],
      ]),
      history: new Map([
        [1, { dates: ['2026-10-10', '2026-10-14'], series: [200, 183.73] }],
        [2, { dates: ['2026-10-14'], series: [78.81] }],
      ]),
      today: '2026-10-14',
    })
    expect(rows).toHaveLength(1)
    const [r] = rows
    expect(r.weeks).toBe(12)
    expect(r.products.map((p) => p.sealed)).toEqual(['booster-box', 'etb'])
    expect(r.products[0].vsMsrp).toBeCloseTo(183.73 / 161.64 - 1, 5)
    expect(r.products[0].tracked).toEqual({ from: '2026-10-10', price: 200, change: 183.73 / 200 - 1, sinceRelease: false })
    expect(r.products[1].tracked).toBeNull() // one data point is not a trend
  })
  it('says "since release" only when tracking began near the release date', () => {
    const rows = holdingUp({
      releases: [{ id: 'a', name: 'A', date: '2026-10-01', kind: 'main', tcgGroupId: 1 }],
      products: new Map([[1, [sealed({ id: 1, sealed: 'booster-box', msrp: 161.64, msrpSolid: true, market: 150 })]]]),
      history: new Map([[1, { dates: ['2026-10-02', '2026-10-14'], series: [180, 150] }]]),
      today: '2026-10-14',
    })
    expect(rows[0].products[0].tracked?.sinceRelease).toBe(true)
  })
})

describe('release status', () => {
  const pred = { from: '2026-12-07', to: '2026-12-09', likely: '2026-12-09', weekday: 3, basis: 'b' }
  it('reads pre-order state: opened, opens, predicted, due, none', () => {
    expect(preorderStatus({ date: '2027-01-15', preorder: { date: '2026-09-30', where: 'Pokémon Center' } }, '2026-10-14')).toMatchObject({ state: 'opened', date: '2026-09-30', where: 'Pokémon Center' })
    expect(preorderStatus({ date: '2027-01-15', preorder: { date: '2026-10-20' } }, '2026-10-14')).toMatchObject({ state: 'opens', date: '2026-10-20' })
    expect(preorderStatus({ date: '2027-01-15', preorder: null, preorderPrediction: pred }, '2026-10-14')).toMatchObject({ state: 'predicted', inWindow: false, from: '2026-12-07', likely: '2026-12-09' })
    expect(preorderStatus({ date: '2027-01-15', preorder: null, preorderPrediction: pred }, '2026-12-08')).toMatchObject({ state: 'predicted', inWindow: true })
    expect(preorderStatus({ date: '2027-01-15', preorder: null, preorderPrediction: pred }, '2026-12-12')).toMatchObject({ state: 'due' })
    expect(preorderStatus({ date: '2027-01-15', preorder: null }, '2026-10-14')).toEqual({ state: 'none' })
  })
  it('reads the stage of a release', () => {
    const r = { date: '2026-11-06', prerelease: { start: '2026-10-24', end: '2026-11-01' } }
    expect(releaseStage(r, '2026-10-14')).toBe('upcoming')
    expect(releaseStage(r, '2026-10-25')).toBe('prerelease')
    expect(releaseStage(r, '2026-11-06')).toBe('out')
    expect(releaseStage({ date: null, prerelease: null }, '2026-10-14')).toBe('tba')
  })
  it('splits products that go on sale before or after the set', () => {
    const rows = [
      { label: 'ETB', msrp: 49.99, premium: null },
      { label: 'B&B', msrp: 21.99, premium: null, date: '2026-10-24' },
      { label: 'Poster', msrp: 49.99, premium: null, date: '2026-12-01' },
    ]
    const { early, late } = earlyAndLate(rows, '2026-11-06')
    expect(early.map((r) => r.label)).toEqual(['B&B'])
    expect(late.map((r) => r.label)).toEqual(['Poster'])
  })
  it('picks the products worth a headline: box, ETB, Pokémon Center ETB, bundle', () => {
    const rows = attachProducts([], [
      sealed({ id: 1, sealed: 'pack', market: 5 }),
      sealed({ id: 2, sealed: 'etb', market: 100 }),
      sealed({ id: 3, sealed: 'booster-box', market: 250 }),
      sealed({ id: 4, sealed: 'bundle', market: null }),
      sealed({ id: 5, sealed: 'pc-etb', market: 400 }),
    ])
    expect(headlineRows(rows).map((r) => r.tcg?.sealed)).toEqual(['booster-box', 'etb', 'pc-etb'])
  })
})
