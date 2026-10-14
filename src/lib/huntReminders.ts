// Weekly reminders (data/user/recurring.json): the words, the next start, and the edit form's
// draft <-> Recurring conversion. The alert engine that pushes them lives elsewhere.
import { countdown } from './format.ts'
import { WEEKDAYS_LONG } from './hunt.ts'
import { nextOccurrence } from './recurring.ts'
import type { Recurring } from './user.ts'

export const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Los_Angeles', label: 'Pacific' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
]

/** "5:00 PM" from "17:00". */
export function clock12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** "ET", "PT" (the zone's generic short name, so it doesn't flip between EDT and EST). */
export function zoneAbbr(tz: string, at = Date.now()): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortGeneric' }).formatToParts(new Date(at)).find((p) => p.type === 'timeZoneName')?.value ?? tz
  } catch {
    return tz
  }
}

/** "Wednesdays at 5:00 PM ET" */
export function scheduleText(r: Pick<Recurring, 'weekday' | 'time' | 'tz'>): string {
  return `${WEEKDAYS_LONG[r.weekday]}s at ${clock12(r.time)} ${zoneAbbr(r.tz)}`
}

export interface NextInfo {
  start: Date
  /** "Wed, Oct 14 at 2:00 PM" in the viewer's own time. */
  label: string
  /** "6h 0m", "2d 3h", or "now". */
  countdown: string
  inProgress: boolean
}

export function nextInfo(r: Pick<Recurring, 'weekday' | 'time' | 'tz' | 'durationMin'>, now = Date.now()): NextInfo {
  const start = nextOccurrence(r, now)
  const inProgress = start.getTime() <= now
  const label = `${start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  return { start, label, countdown: inProgress ? 'now' : countdown(start.toISOString(), now), inProgress }
}

/** Enabled reminders by how soon they start, then the switched-off ones. */
export function sortReminders(list: Recurring[], now = Date.now()): Recurring[] {
  const key = (r: Recurring) => (r.enabled ? nextOccurrence(r, now).getTime() : Infinity)
  return [...list].sort((a, b) => key(a) - key(b) || a.title.localeCompare(b.title))
}

// ---------- the form ----------

export interface ReminderDraft {
  title: string
  weekday: number
  time: string
  tz: string
  url: string
  /** Minutes, as typed. */
  alertBefore: string
  durationMin: string
  note: string
}

export function emptyDraft(): ReminderDraft {
  return { title: '', weekday: 3, time: '17:00', tz: 'America/New_York', url: '', alertBefore: '10', durationMin: '', note: '' }
}

export function draftOf(r: Recurring): ReminderDraft {
  return {
    title: r.title,
    weekday: r.weekday,
    time: r.time,
    tz: r.tz,
    url: r.url ?? '',
    alertBefore: r.alertBefore != null ? String(r.alertBefore) : '',
    durationMin: r.durationMin != null ? String(r.durationMin) : '',
    note: r.note ?? '',
  }
}

const isWhole = (s: string) => /^\d+$/.test(s.trim())

/** The first thing wrong with a draft, in plain words, or null. */
export function validateDraft(d: ReminderDraft): string | null {
  if (!d.title.trim()) return 'Give the reminder a title.'
  const t = /^(\d{1,2}):(\d{2})$/.exec(d.time)
  if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) return 'Pick a valid time.'
  if (d.alertBefore.trim() && !isWhole(d.alertBefore)) return 'Alert minutes should be a whole number (0 or more).'
  if (d.durationMin.trim() && (!isWhole(d.durationMin) || Number(d.durationMin) < 1)) return 'Duration should be a whole number of minutes, at least 1.'
  if (d.url.trim() && !/^https?:\/\/\S+\.\S+/.test(d.url.trim())) return 'That link should start with https://'
  return null
}

export function toRecurring(d: ReminderDraft, id: string, enabled: boolean): Recurring {
  const time = d.time.padStart(5, '0')
  return {
    id,
    title: d.title.trim(),
    weekday: d.weekday,
    time,
    tz: d.tz,
    ...(d.durationMin.trim() ? { durationMin: Number(d.durationMin) } : {}),
    ...(d.url.trim() ? { url: d.url.trim() } : {}),
    ...(d.note.trim() ? { note: d.note.trim() } : {}),
    enabled,
    ...(d.alertBefore.trim() ? { alertBefore: Number(d.alertBefore) } : {}),
  }
}
