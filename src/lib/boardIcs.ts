// Single-event .ics files for the Board's "Add to calendar" button (RFC 5545, minimal subset).
import { EVENT_LENGTH } from './board.ts'
import type { Post } from './user.ts'

const enc = new TextEncoder()

/** Escapes a TEXT value: backslash, semicolon, comma and newlines. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** UTC instant as YYYYMMDDTHHMMSSZ. */
export function icsStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/** Folds a content line to at most 75 bytes per line, never splitting a character. */
export function foldLine(line: string): string {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  let limit = 75
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > limit) {
      out.push(cur)
      cur = ' '
      bytes = 1
      limit = 75
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n')
}

export interface IcsEvent {
  uid: string
  title: string
  start: number
  end: number
  stamp: number
  location?: string
  description?: string
  url?: string
  /** Minutes before the start to ring a reminder. */
  alarmMinutes?: number
}

export function buildIcs(e: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//yungmewtwo//Board//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${icsStamp(e.stamp)}`,
    `DTSTART:${icsStamp(e.start)}`,
    `DTEND:${icsStamp(e.end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
  ]
  if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`)
  if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`)
  if (e.url) lines.push(`URL:${e.url}`)
  if (e.alarmMinutes != null) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title)}`, `TRIGGER:-PT${e.alarmMinutes}M`, 'END:VALARM')
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

export interface CalendarEvent extends Omit<IcsEvent, 'stamp'> {
  filename: string
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'event'

/** The calendar entry for a post: a drop at its go-live time, an event over its hours, a drawing
 *  or deal as its closing time. Undefined when the post has no time to put on a calendar. */
export function calendarEventFor(p: Post): CalendarEvent | undefined {
  const starts = p.starts ? Date.parse(p.starts) : NaN
  const ends = p.ends ? Date.parse(p.ends) : NaN
  const detail = [p.note, p.store && p.type !== 'event' ? `At ${p.store}` : undefined].filter(Boolean).join('\n') || undefined
  const common = { uid: `${p.id}@yungmewtwo`, url: p.url, description: detail, filename: `${slug(p.title)}.ics` }
  if (p.type === 'drop' && !Number.isNaN(starts)) {
    return { ...common, title: `Drop: ${p.title}${p.store ? ` (${p.store})` : ''}`, start: starts, end: starts + 30 * 60_000, location: p.where, alarmMinutes: 15 }
  }
  if (p.type === 'event' && !Number.isNaN(starts)) {
    return { ...common, title: p.title, start: starts, end: !Number.isNaN(ends) ? ends : starts + EVENT_LENGTH, location: p.where ?? p.store, alarmMinutes: 60 }
  }
  if ((p.type === 'drawing' || p.type === 'deal') && !Number.isNaN(ends)) {
    return { ...common, title: `${p.type === 'drawing' ? 'Drawing closes' : 'Deal ends'}: ${p.title}`, start: ends - 15 * 60_000, end: ends, location: p.where, alarmMinutes: 45 }
  }
  return undefined
}
