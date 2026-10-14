import { describe, expect, it } from 'vitest'
import { ITEM_CHIPS, RESULTS, buildSighting, recentSetChips, resolveWhen, resultLabel, sightingLine, sightingMessage, shortSetName } from './huntLog.ts'

// Wed 2026-10-14 11:00 America/New_York (EDT).
const NOW = Date.UTC(2026, 9, 14, 15, 0)

describe('results', () => {
  it('offers the four outcomes in the order you tap them', () => {
    expect(RESULTS.map((r) => r.value)).toEqual(['stocked', 'limited', 'empty', 'restocking'])
    expect(resultLabel('restocking')).toBe('Restocking now')
    expect(resultLabel('empty')).toBe('Empty')
  })
  it('has the item chips from the brief', () => {
    expect(ITEM_CHIPS).toEqual(['ETBs', 'Booster bundles', 'Blisters', 'Tins', 'Booster packs', 'Collection boxes'])
  })
})

describe('set chips', () => {
  const releases = [
    { name: 'Mega Evolution—Chaos Rising', date: '2026-05-22', region: 'EN', kind: 'main' },
    { name: 'Mega Evolution—Pitch Black', date: '2026-07-17', region: 'EN', kind: 'main' },
    { name: '30th Celebration', date: '2026-09-16', region: 'EN', kind: 'special' },
    { name: 'Mega Evolution—Delta Reign', date: '2026-11-06', region: 'EN', kind: 'main' },
    { name: 'English Aura Seeker (name unannounced)', date: null, region: 'EN', kind: 'main' },
    { name: 'Storm Emeralda', date: '2026-07-31', region: 'JP', kind: 'main' },
    { name: 'Mega Greninja ex Premium Collection', date: '2026-07-03', region: 'EN', kind: 'product' },
    { name: 'Mega Evolution', date: '2025-09-26', region: 'EN', kind: 'main' },
  ]
  it('shortens set names', () => {
    expect(shortSetName('Mega Evolution—Delta Reign')).toBe('Delta Reign')
    expect(shortSetName('Mega Evolution—Ascended Heroes')).toBe('Ascended Heroes')
    expect(shortSetName('30th Celebration')).toBe('30th Celebration')
    expect(shortSetName('Mega Evolution')).toBe('Mega Evolution')
  })
  it('picks recent and upcoming English sets, newest first', () => {
    expect(recentSetChips(releases, NOW, 3)).toEqual(['Delta Reign', '30th Celebration', 'Pitch Black'])
  })
  it('skips undated, Japanese, product-only and stale releases', () => {
    const all = recentSetChips(releases, NOW, 10)
    expect(all).not.toContain('Storm Emeralda')
    expect(all).not.toContain('Mega Greninja ex Premium Collection')
    expect(all).not.toContain('Mega Evolution')
    expect(all.some((n) => n.includes('Aura'))).toBe(false)
  })
})

describe('resolveWhen', () => {
  it('defaults to now', () => {
    expect(resolveWhen('now', undefined, NOW)).toBe(new Date(NOW).toISOString())
  })
  it('puts "earlier today" at that store-time clock reading', () => {
    // 8:15 in the morning, Eastern.
    expect(resolveWhen('earlier', '08:15', NOW)).toBe('2026-10-14T12:15:00.000Z')
  })
  it('never lands in the future', () => {
    expect(resolveWhen('earlier', '18:00', NOW)).toBe(new Date(NOW).toISOString())
  })
  it('handles yesterday', () => {
    expect(resolveWhen('yesterday', '17:30', NOW)).toBe('2026-10-13T21:30:00.000Z')
  })
  it('falls back to now on a bad time', () => {
    expect(resolveWhen('earlier', '', NOW)).toBe(new Date(NOW).toISOString())
    expect(resolveWhen('earlier', 'soon', NOW)).toBe(new Date(NOW).toISOString())
  })
})

describe('buildSighting', () => {
  it('keeps only what was filled in', () => {
    const s = buildSighting({ id: 'a1', by: 'alex', store: 'target-abc123', result: 'stocked', at: '2026-10-14T15:00:00.000Z', items: [], note: '  ' })
    expect(s).toEqual({ id: 'a1', store: 'target-abc123', by: 'alex', at: '2026-10-14T15:00:00.000Z', result: 'stocked' })
  })
  it('includes items and a trimmed note', () => {
    const s = buildSighting({ id: 'a2', by: 'alex', store: 's', result: 'limited', at: '2026-10-14T15:00:00.000Z', items: ['ETBs', 'Delta Reign'], note: ' two left ' })
    expect(s).toMatchObject({ items: ['ETBs', 'Delta Reign'], note: 'two left' })
  })
})

describe('copy', () => {
  it('writes the commit message', () => {
    expect(sightingMessage('Alex', 'Target Sandy Springs', 'stocked')).toBe('hunt: Alex — Target Sandy Springs: stocked')
    expect(sightingMessage('Alex', 'Target Sandy Springs', 'restocking')).toBe('hunt: Alex — Target Sandy Springs: restocking')
  })
  it('summarizes a sighting for a list', () => {
    const s = buildSighting({ id: 'a', by: 'alex', store: 's', result: 'stocked', at: new Date(NOW - 2 * 86_400_000).toISOString() })
    expect(sightingLine(s, 'Alex', NOW)).toBe('Stocked 2d ago · Alex')
    const e = buildSighting({ id: 'b', by: 'alex', store: 's', result: 'empty', at: new Date(NOW - 30 * 60_000).toISOString() })
    expect(sightingLine(e, 'Paul', NOW)).toBe('Empty 30m ago · Paul')
  })
})
