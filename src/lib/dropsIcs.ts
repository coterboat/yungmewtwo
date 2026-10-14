// iCalendar (RFC 5545) writer for the "yungmewtwo drops" feed: releases, prerelease windows,
// pre-order dates (actual and predicted), drawing deadlines, drop times and the weekly events.
// Pure functions: events in, text out. scripts/site/32-calendar.ts does the file work.
import { addDays, shortName, weekdayOf, type DropRelease } from './drops.ts'
import type { Post, Recurring } from './user.ts'
import { zonedInstant } from './recurring.ts'

const UID_HOST = 'yungmewtwo'
const SITE = 'https://coterboat.github.io/yungmewtwo/'

export interface IcsEvent {
  uid: string
  summary: string
  description?: string
  url?: string
  location?: string
  /** All-day: `end` is the last day, inclusive (the writer adds the extra day iCalendar wants). */
  allDay?: { start: string; end?: string }
  /** Timed, as UTC instants in ms. */
  start?: number
  end?: number
  /** Repeats every week at this wall-clock time in `tz`; `firstDate` is the first such day. */
  weekly?: { tz: string; weekday: number; time: string; durationMin: number; firstDate: string }
  alarm?: { minutes: number; related?: 'START' | 'END' }
  /** Free time: an all-day release shouldn't mark you busy. */
  transparent?: boolean
  categories?: string[]
}

// ---------- low-level text rules ----------

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n')
}

export const icsDate = (d: string) => d.replace(/-/g, '')

export function icsDateTime(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

const encoder = new TextEncoder()

/** Lines longer than 75 octets continue on the next line after CRLF + one space. UTF-8 characters are never split. */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  let curBytes = 0
  let limit = 75
  for (const ch of line) {
    const n = encoder.encode(ch).length
    if (curBytes + n > limit) {
      out.push(cur)
      cur = ''
      curBytes = 0
      limit = 74 // the leading space counts
    }
    cur += ch
    curBytes += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

export const unfold = (text: string) => text.replace(/\r\n[ \t]/g, '')

// ---------- time zones ----------

interface ZoneRule {
  std: { name: string; offset: string }
  dst?: { name: string; offset: string }
}

/** US zones, 2007-and-later rules (DST from the second Sunday of March to the first of November). */
const ZONES: Record<string, ZoneRule> = {
  'America/New_York': { std: { name: 'EST', offset: '-0500' }, dst: { name: 'EDT', offset: '-0400' } },
  'America/Chicago': { std: { name: 'CST', offset: '-0600' }, dst: { name: 'CDT', offset: '-0500' } },
  'America/Denver': { std: { name: 'MST', offset: '-0700' }, dst: { name: 'MDT', offset: '-0600' } },
  'America/Los_Angeles': { std: { name: 'PST', offset: '-0800' }, dst: { name: 'PDT', offset: '-0700' } },
  'America/Phoenix': { std: { name: 'MST', offset: '-0700' } },
}

function vtimezone(tzid: string): string[] | null {
  const z = ZONES[tzid]
  if (!z) return null
  const lines = ['BEGIN:VTIMEZONE', `TZID:${tzid}`]
  if (z.dst) {
    lines.push('BEGIN:DAYLIGHT', `TZOFFSETFROM:${z.std.offset}`, `TZOFFSETTO:${z.dst.offset}`, `TZNAME:${z.dst.name}`, 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT')
    lines.push('BEGIN:STANDARD', `TZOFFSETFROM:${z.dst.offset}`, `TZOFFSETTO:${z.std.offset}`, `TZNAME:${z.std.name}`, 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD')
  } else {
    lines.push('BEGIN:STANDARD', `TZOFFSETFROM:${z.std.offset}`, `TZOFFSETTO:${z.std.offset}`, `TZNAME:${z.std.name}`, 'DTSTART:19700101T000000', 'END:STANDARD')
  }
  lines.push('END:VTIMEZONE')
  return lines
}

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** Wall-clock "YYYYMMDDTHHMM00" plus minutes, with no zone maths (fine for an hour at 5pm). */
function wallPlus(date: string, time: string, minutes: number): string {
  const [hh, mm] = time.split(':').map(Number)
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hh, mm + minutes)
  return new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '').replace(/Z$/, '')
}

// ---------- document ----------

function eventLines(e: IcsEvent, stamp: string): string[] {
  const l: string[] = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`]
  if (e.allDay) {
    l.push(`DTSTART;VALUE=DATE:${icsDate(e.allDay.start)}`, `DTEND;VALUE=DATE:${icsDate(addDays(e.allDay.end ?? e.allDay.start, 1))}`)
  } else if (e.weekly) {
    const w = e.weekly
    const hhmm = w.time.replace(':', '')
    if (ZONES[w.tz]) {
      l.push(`DTSTART;TZID=${w.tz}:${icsDate(w.firstDate)}T${hhmm}00`, `DTEND;TZID=${w.tz}:${wallPlus(w.firstDate, w.time, w.durationMin)}`)
    } else {
      // No rules for this zone: pin the first occurrence in UTC (a one-hour drift across daylight saving).
      const [hh, mm] = w.time.split(':').map(Number)
      const start = zonedInstant(Number(w.firstDate.slice(0, 4)), Number(w.firstDate.slice(5, 7)) - 1, Number(w.firstDate.slice(8, 10)), hh, mm, w.tz)
      l.push(`DTSTART:${icsDateTime(start)}`, `DTEND:${icsDateTime(start + w.durationMin * 60_000)}`)
    }
    l.push(`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[w.weekday]}`)
  } else if (e.start != null) {
    l.push(`DTSTART:${icsDateTime(e.start)}`, `DTEND:${icsDateTime(e.end ?? e.start + 30 * 60_000)}`)
  }
  l.push(`SUMMARY:${escapeText(e.summary)}`)
  if (e.description) l.push(`DESCRIPTION:${escapeText(e.description)}`)
  if (e.location) l.push(`LOCATION:${escapeText(e.location)}`)
  if (e.url) l.push(`URL:${e.url}`)
  if (e.categories?.length) l.push(`CATEGORIES:${e.categories.map(escapeText).join(',')}`)
  l.push(`TRANSP:${e.transparent ? 'TRANSPARENT' : 'OPAQUE'}`)
  if (e.alarm) {
    const rel = e.alarm.related === 'END' ? ';RELATED=END' : ''
    const m = e.alarm.minutes
    l.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(e.summary)}`, `TRIGGER${rel}:-PT${m % 60 === 0 ? `${m / 60}H` : `${m}M`}`, 'END:VALARM')
  }
  l.push('END:VEVENT')
  return l
}

export function buildCalendar(events: IcsEvent[], opts: { name: string; now: number; description?: string }): string {
  const stamp = icsDateTime(opts.now)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${UID_HOST}//drops//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    ...(opts.description ? [`X-WR-CALDESC:${escapeText(opts.description)}`] : []),
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  const zones = new Set(events.map((e) => e.weekly?.tz).filter((tz): tz is string => !!tz && !!ZONES[tz]))
  for (const tz of zones) lines.push(...vtimezone(tz)!)
  for (const e of events) lines.push(...eventLines(e, stamp))
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

// ---------- events from the app's data ----------

const uid = (kind: string, id: string) => `${kind}-${id}@${UID_HOST}`

const money = (n: number) => `$${n.toFixed(2)}`
const RELEASE_BACK_DAYS = 60
const KEEP_RECENT_DAYS = 7

function span(a: string, b: string) {
  return a === b ? a : `${a} to ${b}`
}

export function releaseEvents(releases: DropRelease[], today: string): IcsEvent[] {
  const out: IcsEvent[] = []
  const recent = addDays(today, -KEEP_RECENT_DAYS)
  for (const r of releases) {
    const name = shortName(r.name)
    const label = r.code ? `${name} (${r.code})` : name
    const rumor = r.confidence === 'low' ? ' (rumor)' : ''
    if (r.date && r.date >= addDays(today, -RELEASE_BACK_DAYS) && !(r.region === 'JP' && r.kind === 'product' && r.confidence === 'low')) {
      const lines: string[] = []
      if (r.dateNote) lines.push(r.dateNote)
      if (r.pair) lines.push(`${r.pair.region === 'JP' ? 'Japanese' : 'English'} counterpart: ${shortName(r.pair.name)}${r.pair.date ? ` (${r.pair.date})` : ''}`)
      const priced = r.products.filter((p) => p.msrp != null).slice(0, 8)
      if (priced.length) lines.push('MSRP: ' + priced.map((p) => `${p.label.replace(/\s*\(.*$/, '')} ${money(p.msrp!)}`).join('; '))
      if (r.confidence === 'low') lines.push('Confidence: low. Treat this one as a rumor.')
      if (r.origin === 'tcgplayer') lines.push('Detected on TCGplayer; not in the curated calendar yet.')
      lines.push(`More: ${SITE}#/drops`)
      out.push({
        uid: uid('release', r.id),
        summary: `${r.region === 'JP' ? 'JP: ' : r.kind === 'product' ? 'Product: ' : ''}${label} releases${rumor}`,
        description: lines.join('\n'),
        url: `${SITE}#/drops`,
        allDay: { start: r.date },
        transparent: true,
        categories: ['Release', r.region],
      })
    }
    if (r.prerelease && r.prerelease.end >= recent) {
      out.push({
        uid: uid('prerelease', r.id),
        summary: `${name} prerelease${r.region === 'JP' ? ' (JP)' : ''}`,
        description: `Prerelease events ${span(r.prerelease.start, r.prerelease.end)}. Release is ${r.date ?? 'not announced'}.\nMore: ${SITE}#/drops`,
        url: `${SITE}#/drops`,
        allDay: { start: r.prerelease.start, end: r.prerelease.end },
        transparent: true,
        categories: ['Prerelease'],
      })
    }
    if (r.preorder && r.preorder.date >= recent) {
      out.push({
        uid: uid('preorder', r.id),
        summary: `${name} pre-orders open${r.preorder.where ? ` at ${r.preorder.where}` : ''}`,
        description: [r.preorder.note, `More: ${SITE}#/drops`].filter(Boolean).join('\n'),
        url: `${SITE}#/drops`,
        allDay: { start: r.preorder.date },
        transparent: true,
        categories: ['Pre-order'],
      })
    } else if (r.preorderPrediction && r.preorderPrediction.to >= today) {
      const p = r.preorderPrediction
      out.push({
        uid: uid('preorder-predicted', r.id),
        summary: `${name} pre-order window (predicted)`,
        description: `A prediction, not an announcement: ${p.basis}. Most likely ${p.likely}.\nMore: ${SITE}#/drops`,
        url: `${SITE}#/drops`,
        allDay: { start: p.from, end: p.to },
        transparent: true,
        categories: ['Pre-order', 'Prediction'],
      })
    }
  }
  return out
}

const MIN = 60_000
const POST_GRACE = 2 * 86_400_000

export function postEvents(posts: Post[], people: Array<{ id: string; name: string }>, now: number): IcsEvent[] {
  const out: IcsEvent[] = []
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id
  for (const p of posts) {
    if (p.archived) continue
    const starts = p.starts ? Date.parse(p.starts) : NaN
    const ends = p.ends ? Date.parse(p.ends) : NaN
    let ev: Pick<IcsEvent, 'summary' | 'start' | 'end' | 'alarm'> | undefined
    if (p.type === 'drawing' && !Number.isNaN(ends)) {
      ev = { summary: `Drawing closes: ${p.title}`, start: Number.isNaN(starts) ? ends - 30 * MIN : starts, end: ends, alarm: { minutes: 60, related: 'END' } }
    } else if (p.type === 'drop' && !Number.isNaN(starts)) {
      ev = { summary: `Drop: ${p.title}`, start: starts, end: Number.isNaN(ends) ? starts + 30 * MIN : ends, alarm: { minutes: 15 } }
    } else if (p.type === 'event' && !Number.isNaN(starts)) {
      ev = { summary: `Event: ${p.title}`, start: starts, end: Number.isNaN(ends) ? starts + 120 * MIN : ends, alarm: { minutes: 60 } }
    }
    if (!ev || (ev.end ?? ev.start ?? 0) < now - POST_GRACE) continue
    const lines = [p.store ? `${p.store}${p.where ? `, ${p.where}` : ''}` : p.where, p.price != null ? `Price ${money(p.price)}` : '', p.note, `Posted by ${name(p.by)}`, p.url, `Board: ${SITE}#/board`].filter(Boolean)
    out.push({ uid: uid('post', p.id), ...ev, description: lines.join('\n'), url: p.url ?? `${SITE}#/board`, ...(p.where ? { location: p.where } : {}), categories: [p.type === 'drawing' ? 'Drawing' : p.type === 'drop' ? 'Drop' : 'Event'] })
  }
  return out
}

export function recurringEvents(items: Recurring[], anchor: string): IcsEvent[] {
  const out: IcsEvent[] = []
  for (const r of items) {
    if (!r.enabled) continue
    let first = anchor
    while (weekdayOf(first) !== r.weekday) first = addDays(first, 1)
    out.push({
      uid: uid('weekly', r.id),
      summary: r.title,
      description: [r.note, r.url, `Weekly. ${SITE}#/board`].filter(Boolean).join('\n'),
      ...(r.url ? { url: r.url } : {}),
      weekly: { tz: r.tz, weekday: r.weekday, time: r.time, durationMin: r.durationMin ?? 60, firstDate: first },
      alarm: { minutes: r.alertBefore ?? 10 },
      categories: ['Weekly'],
    })
  }
  return out
}
