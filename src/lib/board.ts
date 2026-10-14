// Board logic: what is open or past, how posts sort, per-person statuses, countdown text and
// commit messages. Pure functions of (posts, now) so they are easy to test; no DOM here.
import type { Post, PostType } from './user.ts'

export const POST_TYPES: PostType[] = ['deal', 'drawing', 'drop', 'event', 'note']

export const TYPE_META: Record<PostType, { label: string; plural: string; article: 'a' | 'an' }> = {
  deal: { label: 'Deal', plural: 'Deals', article: 'a' },
  drawing: { label: 'Drawing', plural: 'Drawings', article: 'a' },
  drop: { label: 'Drop', plural: 'Drops', article: 'a' },
  event: { label: 'Event', plural: 'Events', article: 'an' },
  note: { label: 'Note', plural: 'Notes', article: 'a' },
}

export type Scope = 'open' | 'past'
export type TypeFilter = 'all' | PostType

const HOUR = 3_600_000
/** A drop stays "live" this long after it goes live, then moves to Past. */
export const LIVE_WINDOW = 2 * HOUR
/** An event with no end time is treated as lasting this long. */
export const EVENT_LENGTH = 3 * HOUR
/** Under this much time left, a drawing gets the urgent look. */
export const URGENT_WITHIN = 3 * HOUR

const t = (iso: string | undefined) => {
  if (!iso) return undefined
  const v = Date.parse(iso)
  return Number.isNaN(v) ? undefined : v
}

/** The time that matters for a post: when a drawing or deal closes, when a drop or event begins. */
export function deadline(p: Post): number | undefined {
  return p.type === 'drawing' || p.type === 'deal' ? t(p.ends) : p.type === 'drop' || p.type === 'event' ? t(p.starts) : undefined
}

/** When a post stops being actionable on its own (undefined = only when someone archives it). */
export function closesAt(p: Post): number | undefined {
  switch (p.type) {
    case 'drawing':
    case 'deal':
      return t(p.ends)
    case 'drop': {
      const s = t(p.starts)
      return s == null ? undefined : s + LIVE_WINDOW
    }
    case 'event': {
      const e = t(p.ends)
      if (e != null) return e
      const s = t(p.starts)
      return s == null ? undefined : s + EVENT_LENGTH
    }
    default:
      return undefined
  }
}

export function isPast(p: Post, now: number): boolean {
  if (p.archived) return true
  const c = closesAt(p)
  return c != null && c <= now
}

/** Milliseconds to the post's deadline (negative once passed); undefined when it has none. */
export function timeLeft(p: Post, now: number): number | undefined {
  const d = deadline(p)
  return d == null ? undefined : d - now
}

/** A drawing or deal that closes within three hours and is still open. */
export function isUrgent(p: Post, now: number): boolean {
  if (p.type !== 'drawing' && p.type !== 'deal') return false
  if (isPast(p, now)) return false
  const left = timeLeft(p, now)
  return left != null && left > 0 && left < URGENT_WITHIN
}

export type DropPhase = 'upcoming' | 'live' | 'over'

export function dropPhase(p: Post, now: number): DropPhase {
  const s = t(p.starts)
  if (s == null || s > now) return 'upcoming'
  return now < s + LIVE_WINDOW ? 'live' : 'over'
}

/** Open: live things first, then soonest deadline, then everything without one (newest first).
 *  Past: most recently closed first. */
export function sortPosts(posts: Post[], now: number, scope: Scope): Post[] {
  const copy = [...posts]
  if (scope === 'past') {
    const key = (p: Post) => {
      const c = closesAt(p)
      return c != null && c <= now ? c : (t(p.at) ?? 0)
    }
    return copy.sort((a, b) => key(b) - key(a))
  }
  return copy.sort((a, b) => {
    const da = deadline(a)
    const db = deadline(b)
    if (da != null && db != null) return da - db
    if (da != null) return -1
    if (db != null) return 1
    return (t(b.at) ?? 0) - (t(a.at) ?? 0)
  })
}

export function filterPosts(posts: Post[], type: TypeFilter, scope: Scope, now: number): Post[] {
  return posts.filter((p) => (type === 'all' || p.type === type) && isPast(p, now) === (scope === 'past'))
}

export function scopeCounts(posts: Post[], now: number): Record<Scope, number> {
  let past = 0
  for (const p of posts) if (isPast(p, now)) past++
  return { open: posts.length - past, past }
}

export function countByType(posts: Post[], scope: Scope, now: number): Record<TypeFilter, number> {
  const out: Record<TypeFilter, number> = { all: 0, deal: 0, drawing: 0, drop: 0, event: 0, note: 0 }
  for (const p of posts) {
    if (isPast(p, now) !== (scope === 'past')) continue
    out.all++
    out[p.type]++
  }
  return out
}

// ---------- per-person status ----------

export interface StatusOption {
  value: string
  label: string
}

const DEAL_STATUS: StatusOption[] = [
  { value: 'got', label: 'Got it' },
  { value: 'skip', label: 'Pass' },
]
const DRAWING_STATUS: StatusOption[] = [
  { value: 'in', label: 'Entered' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'skip', label: 'Skip' },
]

export function statusOptions(type: PostType): StatusOption[] {
  return type === 'deal' ? DEAL_STATUS : type === 'drawing' ? DRAWING_STATUS : []
}

/** Sets one person's status, or clears it when they tap the one they already have. */
export function nextStatus(p: Post, personId: string, value: string): Post {
  const status = { ...p.status }
  if (status[personId] === value) delete status[personId]
  else status[personId] = value
  const { status: _old, ...rest } = p
  return Object.keys(status).length ? { ...rest, status } : rest
}

// ---------- text ----------

/** "3d 4h", "2h 14m", "14m 05s", or "closed". */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'closed'
  const totalS = Math.floor(ms / 1000)
  const d = Math.floor(totalS / 86_400)
  const hh = Math.floor((totalS % 86_400) / 3600)
  const m = Math.floor((totalS % 3600) / 60)
  const s = totalS % 60
  if (d > 0) return `${d}d ${hh}h`
  if (hh > 0) return `${hh}h ${m}m`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

/** "Sat, Oct 18 · 5:00 PM" (with the year when it is not this year). */
export function formatWhen(iso: string, now = Date.now()): string {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${day} · ${time}`
}

/** "Sat, Oct 18 · 1:00 PM – 4:00 PM", or both dates when the event spans days. */
export function formatRange(startIso: string, endIso: string | undefined, now = Date.now()): string {
  const start = formatWhen(startIso, now)
  if (!endIso) return start
  const a = new Date(startIso)
  const b = new Date(endIso)
  if (a.toDateString() === b.toDateString()) return `${start} – ${b.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  return `${start} → ${formatWhen(endIso, now)}`
}

export type BoardAction = 'posted' | 'edited' | 'archived' | 'unarchived' | 'deleted' | 'responded'

/** Commit subject for a board change, e.g. "board: Alex posted a deal: ETB at Target". */
export function commitMessage(action: BoardAction, name: string, p: Pick<Post, 'type' | 'title'>): string {
  const meta = TYPE_META[p.type]
  const what = `${meta.article} ${p.type}`
  const title = p.title.replace(/\s+/g, ' ').trim()
  const short = title.length > 60 ? `${title.slice(0, 59)}…` : title
  const verb = action === 'responded' ? 'updated their status on' : action
  return `board: ${name} ${verb} ${what}: ${short}`
}
