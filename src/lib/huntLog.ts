// The quick log: what a sighting is made of, and the words around it.
import { ago } from './format.ts'
import { TZ } from './hunt.ts'
import { zonedInstant } from './recurring.ts'
import type { Sighting, SightingResult } from './user.ts'

export const RESULTS: Array<{ value: SightingResult; label: string; hint: string }> = [
  { value: 'stocked', label: 'Stocked', hint: 'Plenty on the shelf' },
  { value: 'limited', label: 'Limited', hint: 'A few things left' },
  { value: 'empty', label: 'Empty', hint: 'Nothing there' },
  { value: 'restocking', label: 'Restocking now', hint: 'The vendor is stocking it' },
]

export function resultLabel(r: SightingResult): string {
  return RESULTS.find((x) => x.value === r)?.label ?? r
}

export const ITEM_CHIPS = ['ETBs', 'Booster bundles', 'Blisters', 'Tins', 'Booster packs', 'Collection boxes']

// ---------- set chips ----------

export interface ReleaseLite {
  name: string
  date: string | null
  region: string
  kind: string
}

/** "Mega Evolution—Delta Reign" -> "Delta Reign". */
export function shortSetName(name: string): string {
  const m = /^Mega Evolution\s*[—–-]\s*(.+)$/.exec(name)
  return (m ? m[1] : name).trim()
}

/** Main and special English sets released in the last ~5 months or coming in the next ~2.5,
 *  newest first, so the set you're hunting is one tap away. */
export function recentSetChips(releases: ReleaseLite[], now: number, limit = 4): string[] {
  const DAY = 86_400_000
  return releases
    .filter((r) => r.date && r.region === 'EN' && (r.kind === 'main' || r.kind === 'special'))
    .map((r) => ({ name: shortSetName(r.name), at: Date.parse(`${r.date}T12:00:00Z`) }))
    .filter((r) => r.at >= now - 150 * DAY && r.at <= now + 75 * DAY)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map((r) => r.name)
}

// ---------- when ----------

export type WhenMode = 'now' | 'earlier' | 'yesterday'

function dayParts(ms: number, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(ms))
  const get = (t: string) => Number(f.find((p) => p.type === t)?.value)
  return { y: get('year'), m: get('month') - 1, d: get('day') }
}

/** The ISO time to save. "Earlier today" and "yesterday" take a clock time in the stores' zone,
 *  and a time that hasn't happened yet is treated as now. */
export function resolveWhen(mode: WhenMode, hhmm: string | undefined, now: number, tz = TZ): string {
  const nowIso = new Date(now).toISOString()
  if (mode === 'now') return nowIso
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '')
  if (!m) return nowIso
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh > 23 || mm > 59) return nowIso
  const { y, m: mo, d } = dayParts(now, tz)
  const t = zonedInstant(y, mo, mode === 'yesterday' ? d - 1 : d, hh, mm, tz)
  return new Date(Math.min(t, now)).toISOString()
}

/** "HH:MM" in the stores' zone, for prefilling the time picker. */
export function clockNow(now: number, tz = TZ): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now))
}

// ---------- building and describing ----------

export interface SightingInput {
  id: string
  by: string
  store: string
  result: SightingResult
  at: string
  items?: string[]
  note?: string
}

export function buildSighting(i: SightingInput): Sighting {
  const note = i.note?.trim()
  return {
    id: i.id,
    store: i.store,
    by: i.by,
    at: i.at,
    result: i.result,
    ...(i.items && i.items.length ? { items: i.items } : {}),
    ...(note ? { note } : {}),
  }
}

/** Commit message: "hunt: Alex — Target Sandy Springs: stocked". */
export function sightingMessage(person: string, storeName: string, result: SightingResult): string {
  return `hunt: ${person} — ${storeName}: ${result}`
}

/** "Stocked 2d ago · Alex" */
export function sightingLine(s: Sighting, byName: string, now = Date.now()): string {
  return `${resultLabel(s.result)} ${ago(s.at, now)} · ${byName}`
}
