import { describe, expect, it } from 'vitest'
import type { DropRelease } from './drops.ts'
import { buildCalendar, escapeText, foldLine, icsDate, icsDateTime, postEvents, recurringEvents, releaseEvents, unfold } from './dropsIcs.ts'
import type { Post, Recurring } from './user.ts'

const NOW = Date.parse('2026-10-14T12:00:00Z')
const bytes = (s: string) => new TextEncoder().encode(s).length

describe('ics text rules', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeText('a, b; c\\d\r\ne\nf')).toBe('a\\, b\\; c\\\\d\\ne\\nf')
  })
  it('formats dates and instants', () => {
    expect(icsDate('2026-11-06')).toBe('20261106')
    expect(icsDateTime(Date.parse('2026-10-14T21:00:00Z'))).toBe('20261014T210000Z')
  })
  it('folds at 75 octets and unfolds back', () => {
    const line = 'DESCRIPTION:' + 'The quick brown fox jumps over the lazy dog. '.repeat(8)
    const folded = foldLine(line)
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) expect(bytes(p)).toBeLessThanOrEqual(75)
    for (const p of parts.slice(1)) expect(p.startsWith(' ')).toBe(true)
    expect(unfold(folded)).toBe(line)
  })
  it('never splits a multi-byte character', () => {
    const line = 'SUMMARY:' + 'Pokémon—Delta Reign “Ω” '.repeat(12)
    const folded = foldLine(line)
    for (const p of folded.split('\r\n')) expect(bytes(p)).toBeLessThanOrEqual(75)
    expect(unfold(folded)).toBe(line)
    expect(folded).not.toContain('�')
  })
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:hi')).toBe('SUMMARY:hi')
  })
})

describe('calendar document', () => {
  const cal = buildCalendar(
    [
      { uid: 'release-a@x', summary: 'Delta Reign releases', allDay: { start: '2026-11-06' }, description: 'Line one\nLine two, with comma' },
      { uid: 'release-b@x', summary: 'Delta Reign prerelease', allDay: { start: '2026-10-24', end: '2026-11-01' } },
      { uid: 'drawing-1@x', summary: 'Drawing closes', start: Date.parse('2026-10-14T20:00:00Z'), end: Date.parse('2026-10-14T21:00:00Z'), alarm: { minutes: 60, related: 'END' }, url: 'https://example.com/d' },
    ],
    { name: 'yungmewtwo drops', now: NOW },
  )
  const lines = cal.split('\r\n')
  it('is CRLF-only, framed, and named', () => {
    expect(cal.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(cal.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('VERSION:2.0')
    expect(lines).toContain('PRODID:-//yungmewtwo//drops//EN')
    expect(lines).toContain('X-WR-CALNAME:yungmewtwo drops')
  })
  it('keeps every line within 75 octets', () => {
    for (const l of lines) expect(bytes(l)).toBeLessThanOrEqual(75)
  })
  it('writes all-day events with an exclusive end', () => {
    expect(lines).toContain('DTSTART;VALUE=DATE:20261106')
    expect(lines).toContain('DTEND;VALUE=DATE:20261107')
    expect(lines).toContain('DTSTART;VALUE=DATE:20261024')
    expect(lines).toContain('DTEND;VALUE=DATE:20261102')
  })
  it('stamps each event with a stable UID and DTSTAMP', () => {
    expect(lines.filter((l) => l === 'DTSTAMP:20261014T120000Z')).toHaveLength(3)
    expect(lines).toContain('UID:release-a@x')
    expect(unfold(cal)).toContain('DESCRIPTION:Line one\\nLine two\\, with comma')
  })
  it('writes timed events in UTC with an alarm relative to the end', () => {
    expect(lines).toContain('DTSTART:20261014T200000Z')
    expect(lines).toContain('DTEND:20261014T210000Z')
    expect(lines).toContain('TRIGGER;RELATED=END:-PT1H')
    expect(lines).toContain('URL:https://example.com/d')
  })
})

describe('weekly events', () => {
  const walmart: Recurring = { id: 'walmart-drawing', title: 'Walmart Collectibles Drawing', weekday: 3, time: '17:00', tz: 'America/New_York', durationMin: 60, url: 'https://www.walmart.com/cp/collectibles-drawings/', note: 'Free entry, about a 1-hour window.', enabled: true, alertBefore: 10 }
  it('uses TZID with a VTIMEZONE so it stays at 5pm across daylight saving', () => {
    const cal = buildCalendar(recurringEvents([walmart], '2026-10-14'), { name: 'x', now: NOW })
    const lines = cal.split('\r\n')
    expect(lines).toContain('DTSTART;TZID=America/New_York:20261014T170000')
    expect(lines).toContain('DTEND;TZID=America/New_York:20261014T180000')
    expect(lines).toContain('RRULE:FREQ=WEEKLY;BYDAY=WE')
    expect(lines).toContain('BEGIN:VTIMEZONE')
    expect(lines).toContain('TZID:America/New_York')
    expect(lines.filter((l) => l === 'BEGIN:VTIMEZONE')).toHaveLength(1)
    expect(lines).toContain('RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU')
    expect(lines).toContain('TRIGGER:-PT10M')
  })
  it('starts on the first matching weekday on or after the anchor', () => {
    const ev = recurringEvents([{ ...walmart, weekday: 5 }], '2026-10-14')[0]
    expect(ev.weekly?.firstDate).toBe('2026-10-16')
  })
  it('falls back to UTC for a zone it has no rules for', () => {
    const cal = buildCalendar(recurringEvents([{ ...walmart, tz: 'Europe/Paris' }], '2026-10-14'), { name: 'x', now: NOW })
    const lines = cal.split('\r\n')
    expect(lines).toContain('DTSTART:20261014T150000Z')
    expect(lines).toContain('RRULE:FREQ=WEEKLY;BYDAY=WE')
    expect(lines).not.toContain('BEGIN:VTIMEZONE')
  })
  it('skips disabled events', () => {
    expect(recurringEvents([{ ...walmart, enabled: false }], '2026-10-14')).toEqual([])
  })
})

describe('release events', () => {
  const base: DropRelease = {
    id: 'me06',
    name: 'Mega Evolution—Delta Reign',
    code: 'ME06',
    region: 'EN',
    kind: 'main',
    date: '2026-11-06',
    confidence: 'high',
    origin: 'seed',
    prerelease: { start: '2026-10-24', end: '2026-11-01' },
    preorder: { date: '2026-09-30', where: 'Pokémon Center' },
    products: [{ label: 'Elite Trainer Box', msrp: 49.99, premium: null }],
    presale: true,
  }
  const evs = releaseEvents([base], '2026-10-14')
  it('adds the release, the prerelease window and the pre-order date', () => {
    expect(evs.map((e) => e.uid)).toEqual(['release-me06@yungmewtwo', 'prerelease-me06@yungmewtwo'])
    expect(evs[0].summary).toBe('Delta Reign (ME06) releases')
    expect(evs[1].allDay).toEqual({ start: '2026-10-24', end: '2026-11-01' })
  })
  it('keeps recent pre-order dates and drops old ones', () => {
    const recent = releaseEvents([{ ...base, preorder: { date: '2026-10-10', where: 'Pokémon Center' } }], '2026-10-14')
    expect(recent.map((e) => e.uid)).toContain('preorder-me06@yungmewtwo')
    expect(recent.find((e) => e.uid === 'preorder-me06@yungmewtwo')?.summary).toBe('Delta Reign pre-orders open at Pokémon Center')
  })
  it('marks predicted pre-order windows and rumors', () => {
    const e = releaseEvents(
      [{ ...base, preorder: null, prerelease: null, confidence: 'low', preorderPrediction: { from: '2026-11-18', to: '2026-11-20', likely: '2026-11-18', weekday: 3, basis: 'last 3 sets opened 37–39 days out, mostly on Wednesdays' } }],
      '2026-10-14',
    )
    expect(e.find((x) => x.uid === 'preorder-predicted-me06@yungmewtwo')).toMatchObject({ summary: 'Delta Reign pre-order window (predicted)', allDay: { start: '2026-11-18', end: '2026-11-20' } })
    expect(e.find((x) => x.uid === 'release-me06@yungmewtwo')?.summary).toContain('(rumor)')
  })
  it('skips undated and long-gone releases', () => {
    expect(releaseEvents([{ ...base, date: null, prerelease: null, preorder: null }], '2026-10-14')).toEqual([])
    expect(releaseEvents([{ ...base, date: '2025-01-01', prerelease: null, preorder: null }], '2026-10-14')).toEqual([])
  })
})

describe('post events', () => {
  const people = [
    { id: 'alex', name: 'Alex' },
    { id: 'cousin', name: 'Cousin' },
  ]
  const post = (o: Partial<Post>): Post => ({ id: 'p1', type: 'drawing', by: 'alex', at: '2026-10-14T10:00:00Z', title: 'Target Pokémon drawing', ...o })
  it('turns a drawing into a window that ends at the deadline', () => {
    const [e] = postEvents([post({ ends: '2026-10-15T01:00:00Z', url: 'https://t.co/x', store: 'Target' })], people, NOW)
    expect(e.uid).toBe('post-p1@yungmewtwo')
    expect(e.summary).toBe('Drawing closes: Target Pokémon drawing')
    expect(e.end).toBe(Date.parse('2026-10-15T01:00:00Z'))
    expect(e.start).toBe(Date.parse('2026-10-15T01:00:00Z') - 30 * 60_000)
    expect(e.description).toContain('Posted by Alex')
    expect(e.description).toContain('Target')
  })
  it('uses the open time as the start when the drawing has one', () => {
    const [e] = postEvents([post({ starts: '2026-10-14T18:00:00Z', ends: '2026-10-15T01:00:00Z' })], people, NOW)
    expect(e.start).toBe(Date.parse('2026-10-14T18:00:00Z'))
  })
  it('adds drops and events, and skips archived, past and untimed posts', () => {
    const evs = postEvents(
      [
        post({ id: 'd', type: 'drop', title: 'Costco restock', starts: '2026-10-16T14:00:00Z' }),
        post({ id: 'e', type: 'event', title: 'Prerelease at Dragon Den', starts: '2026-10-24T14:00:00Z', ends: '2026-10-24T18:00:00Z' }),
        post({ id: 'old', ends: '2026-10-01T01:00:00Z' }),
        post({ id: 'arch', ends: '2026-10-20T01:00:00Z', archived: true }),
        post({ id: 'deal', type: 'deal', title: 'ETB $40', ends: '2026-10-20T01:00:00Z' }),
        post({ id: 'note', type: 'note', title: 'Hi' }),
      ],
      people,
      NOW,
    )
    expect(evs.map((e) => [e.uid, e.summary])).toEqual([
      ['post-d@yungmewtwo', 'Drop: Costco restock'],
      ['post-e@yungmewtwo', 'Event: Prerelease at Dragon Den'],
    ])
  })
})
