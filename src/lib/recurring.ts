// Next start of a weekly event (e.g. Wednesday 17:00 America/New_York) as a real instant,
// whatever the viewer's own time zone is.
import type { Recurring } from './user.ts'

/** Minutes the zone is ahead of UTC at `instant`. */
function tzOffsetMinutes(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(instant))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
  return Math.round((asUtc - instant) / 60_000)
}

/** The instant of a wall-clock time in `tz`. */
export function zonedInstant(y: number, m: number, d: number, hh: number, mm: number, tz: string): number {
  const guess = Date.UTC(y, m, d, hh, mm)
  const first = guess - tzOffsetMinutes(guess, tz) * 60_000
  // Re-check once across a DST change.
  return guess - tzOffsetMinutes(first, tz) * 60_000
}

/** Next start at or after `now` (or the current one, if it's still within its duration). */
export function nextOccurrence(r: Pick<Recurring, 'weekday' | 'time' | 'tz' | 'durationMin'>, now = Date.now()): Date {
  const [hh, mm] = r.time.split(':').map(Number)
  const local = new Intl.DateTimeFormat('en-US', { timeZone: r.tz, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(now))
  const y = Number(local.find((p) => p.type === 'year')?.value)
  const m = Number(local.find((p) => p.type === 'month')?.value) - 1
  const d = Number(local.find((p) => p.type === 'day')?.value)
  for (let i = -1; i <= 8; i++) {
    const day = new Date(Date.UTC(y, m, d + i))
    if (day.getUTCDay() !== r.weekday) continue
    const start = zonedInstant(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hh, mm, r.tz)
    if (start + (r.durationMin ?? 0) * 60_000 > now) return new Date(start)
  }
  throw new Error('unreachable')
}
