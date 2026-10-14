import { describe, expect, it } from 'vitest'
import { TIMEZONES, draftOf, emptyDraft, nextInfo, scheduleText, sortReminders, toRecurring, validateDraft } from './huntReminders.ts'
import type { Recurring } from './user.ts'

// Wed 2026-10-14 11:00 America/New_York.
const NOW = Date.UTC(2026, 9, 14, 15, 0)

const walmart: Recurring = {
  id: 'walmart-drawing',
  title: 'Walmart Collectibles Drawing',
  weekday: 3,
  time: '17:00',
  tz: 'America/New_York',
  durationMin: 60,
  url: 'https://www.walmart.com/cp/collectibles-drawings/',
  enabled: true,
  alertBefore: 10,
}

describe('scheduleText', () => {
  it('reads like a sentence', () => {
    expect(scheduleText(walmart)).toBe('Wednesdays at 5:00 PM ET')
    expect(scheduleText({ ...walmart, weekday: 0, time: '09:05' })).toBe('Sundays at 9:05 AM ET')
    expect(scheduleText({ ...walmart, time: '00:30' })).toBe('Wednesdays at 12:30 AM ET')
    expect(scheduleText({ ...walmart, time: '12:00', tz: 'America/Los_Angeles' })).toBe('Wednesdays at 12:00 PM PT')
  })
})

describe('nextInfo', () => {
  it('counts down to the next start', () => {
    const n = nextInfo(walmart, NOW)
    expect(n.start.toISOString()).toBe('2026-10-14T21:00:00.000Z')
    expect(n.countdown).toBe('6h 0m')
    expect(n.inProgress).toBe(false)
    expect(n.label).toContain('Oct 14')
  })
  it('says so when it is happening right now', () => {
    const during = Date.UTC(2026, 9, 14, 21, 20)
    const n = nextInfo(walmart, during)
    expect(n.inProgress).toBe(true)
    expect(n.countdown).toBe('now')
  })
  it('rolls to next week once it is over', () => {
    const after = Date.UTC(2026, 9, 14, 22, 30)
    expect(nextInfo(walmart, after).start.toISOString()).toBe('2026-10-21T21:00:00.000Z')
  })
})

describe('sortReminders', () => {
  it('lists enabled ones by how soon they happen, then the disabled', () => {
    const fri: Recurring = { ...walmart, id: 'fri', weekday: 5 }
    const mon: Recurring = { ...walmart, id: 'mon', weekday: 1 }
    const off: Recurring = { ...walmart, id: 'off', weekday: 3, enabled: false }
    expect(sortReminders([off, mon, fri, walmart], NOW).map((r) => r.id)).toEqual(['walmart-drawing', 'fri', 'mon', 'off'])
  })
})

describe('drafts', () => {
  it('starts as a Wednesday 5pm Eastern reminder with a 10 minute heads-up', () => {
    const d = emptyDraft()
    expect(d).toMatchObject({ tz: 'America/New_York', time: '17:00', alertBefore: '10' })
    expect(TIMEZONES.some((t) => t.value === 'America/New_York')).toBe(true)
  })
  it('round-trips a reminder', () => {
    const d = draftOf(walmart)
    expect(d).toMatchObject({ title: 'Walmart Collectibles Drawing', weekday: 3, time: '17:00', alertBefore: '10', durationMin: '60' })
    expect(toRecurring(d, 'walmart-drawing', true)).toEqual(walmart)
  })
  it('leaves out blanks', () => {
    const r = toRecurring({ ...emptyDraft(), title: ' Target truck day ', url: '', alertBefore: '', durationMin: '', note: '' }, 'x', true)
    expect(r).toEqual({ id: 'x', title: 'Target truck day', weekday: 3, time: '17:00', tz: 'America/New_York', enabled: true })
  })
  it('validates', () => {
    expect(validateDraft(emptyDraft())).toMatch(/title/i)
    const ok = { ...emptyDraft(), title: 'Drop' }
    expect(validateDraft(ok)).toBeNull()
    expect(validateDraft({ ...ok, time: '25:00' })).toMatch(/time/i)
    expect(validateDraft({ ...ok, time: '' })).toMatch(/time/i)
    expect(validateDraft({ ...ok, alertBefore: '-5' })).toMatch(/minutes/i)
    expect(validateDraft({ ...ok, alertBefore: 'soon' })).toMatch(/minutes/i)
    expect(validateDraft({ ...ok, url: 'not a link' })).toMatch(/link/i)
    expect(validateDraft({ ...ok, url: 'https://example.com/x' })).toBeNull()
    expect(validateDraft({ ...ok, durationMin: '0' })).toMatch(/duration/i)
  })
})
