import { describe, expect, it } from 'vitest'
import { buildIcs, calendarEventFor, foldLine, icsEscape, icsStamp } from './boardIcs.ts'
import type { Post } from './user.ts'

describe('icsEscape', () => {
  it('escapes the characters ICS reserves', () => {
    expect(icsEscape('a, b; c\\d\nline2')).toBe('a\\, b\\; c\\\\d\\nline2')
  })
})

describe('icsStamp', () => {
  it('formats a UTC instant as YYYYMMDDTHHMMSSZ', () => {
    expect(icsStamp(Date.parse('2026-10-14T18:05:09Z'))).toBe('20261014T180509Z')
  })
})

describe('foldLine', () => {
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:hi')).toBe('SUMMARY:hi')
  })
  it('folds long lines at 75 bytes with a leading space on continuations', () => {
    const folded = foldLine(`DESCRIPTION:${'a'.repeat(200)}`)
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(2)
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true)
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(`DESCRIPTION:${'a'.repeat(200)}`)
  })
  it('never splits a multi-byte character', () => {
    const folded = foldLine(`SUMMARY:${'é'.repeat(100)}`)
    expect(folded.split('\r\n').map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(`SUMMARY:${'é'.repeat(100)}`)
  })
})

describe('buildIcs', () => {
  const ics = buildIcs({
    uid: 'abc@yungmewtwo',
    title: 'Pokémon Center restock, 9am',
    start: Date.parse('2026-10-16T13:00:00Z'),
    end: Date.parse('2026-10-16T13:30:00Z'),
    stamp: Date.parse('2026-10-14T18:00:00Z'),
    location: 'Target, Roswell',
    description: 'Line one\nLine two',
    url: 'https://example.com/x',
    alarmMinutes: 15,
  })
  it('is a CRLF-terminated calendar with one event', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1)
    expect(ics).not.toMatch(/[^\r]\n/)
  })
  it('carries the details', () => {
    expect(ics).toContain('UID:abc@yungmewtwo\r\n')
    expect(ics).toContain('DTSTAMP:20261014T180000Z\r\n')
    expect(ics).toContain('DTSTART:20261016T130000Z\r\n')
    expect(ics).toContain('DTEND:20261016T133000Z\r\n')
    expect(ics).toContain('SUMMARY:Pokémon Center restock\\, 9am\r\n')
    expect(ics).toContain('LOCATION:Target\\, Roswell\r\n')
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two\r\n')
    expect(ics).toContain('URL:https://example.com/x\r\n')
  })
  it('adds a reminder before the start', () => {
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain('TRIGGER:-PT15M')
    expect(ics).toContain('ACTION:DISPLAY')
  })
  it('omits optional lines that are empty', () => {
    const bare = buildIcs({ uid: 'u', title: 't', start: 0, end: 1000, stamp: 0 })
    expect(bare).not.toContain('LOCATION')
    expect(bare).not.toContain('DESCRIPTION')
    expect(bare).not.toContain('VALARM')
  })
})

describe('calendarEventFor', () => {
  const base: Post = { id: 'p1', type: 'drop', by: 'alex', at: '2026-10-14T12:00:00Z', title: 'Wave 2' }
  it('makes a half-hour event at the drop time', () => {
    const e = calendarEventFor({ ...base, starts: '2026-10-16T13:00:00Z', store: 'Target', url: 'https://t.com/x' })
    expect(e?.start).toBe(Date.parse('2026-10-16T13:00:00Z'))
    expect(e?.end).toBe(Date.parse('2026-10-16T13:30:00Z'))
    expect(e?.title).toBe('Drop: Wave 2 (Target)')
    expect(e?.uid).toBe('p1@yungmewtwo')
    expect(e?.filename).toBe('wave-2.ics')
  })
  it('uses the end time for an event when there is one', () => {
    const e = calendarEventFor({ ...base, type: 'event', starts: '2026-10-18T17:00:00Z', ends: '2026-10-18T20:00:00Z', where: 'Game store' })
    expect(e?.end).toBe(Date.parse('2026-10-18T20:00:00Z'))
    expect(e?.location).toBe('Game store')
  })
  it('puts a drawing on the calendar as its closing time', () => {
    const e = calendarEventFor({ ...base, type: 'drawing', ends: '2026-10-17T23:00:00Z' })
    expect(e?.end).toBe(Date.parse('2026-10-17T23:00:00Z'))
    expect(e?.start).toBe(Date.parse('2026-10-17T22:45:00Z'))
    expect(e?.title).toBe('Drawing closes: Wave 2')
  })
  it('returns nothing without a time', () => {
    expect(calendarEventFor(base)).toBeUndefined()
    expect(calendarEventFor({ ...base, type: 'note' })).toBeUndefined()
  })
})
