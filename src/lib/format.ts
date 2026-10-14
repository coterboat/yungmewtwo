// Number, money and date formatting shared by every screen.

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

/** $4.49, $162, $1,240, $12.9K. */
export function money(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n == null || Number.isNaN(n)) return '—'
  if (opts.compact && Math.abs(n) >= 10_000) return `$${compact.format(n)}`
  return Math.abs(n) >= 100 ? usd0.format(n) : usd2.format(n)
}

/** +12.4% / −3.0%; a fraction in, percent out. */
export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—'
  const v = (n * 100).toFixed(digits)
  return n > 0 ? `+${v}%` : n < 0 ? `−${v.slice(1)}%` : `${v}%`
}

export function num(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('en-US')
}

const DAY = 86_400_000

/** Whole days from today (local) to a YYYY-MM-DD or ISO date; negative = past. */
export function daysUntil(date: string, now = new Date()): number {
  const d = date.length === 10 ? new Date(`${date}T00:00:00`) : new Date(date)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((that.getTime() - today.getTime()) / DAY)
}

/** "Nov 6", or "Nov 6, 2027" when not this year. */
export function shortDate(date: string, now = new Date()): string {
  const d = date.length === 10 ? new Date(`${date}T00:00:00`) : new Date(date)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })
}

export function weekday(date: string): string {
  const d = date.length === 10 ? new Date(`${date}T00:00:00`) : new Date(date)
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

/** "in 3 days", "tomorrow", "today", "2 days ago". */
export function relDays(date: string, now = new Date()): string {
  const n = daysUntil(date, now)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n > 0 ? `in ${n} days` : `${-n} days ago`
}

/** "5m ago", "3h ago", "2d ago" for timestamps; "in 2h" for future ones. */
export function ago(iso: string, now = Date.now()): string {
  const diff = now - Date.parse(iso)
  const abs = Math.abs(diff)
  const [v, u] =
    abs < 60_000 ? [0, 'now'] : abs < 3_600_000 ? [Math.round(abs / 60_000), 'm'] : abs < DAY ? [Math.round(abs / 3_600_000), 'h'] : [Math.round(abs / DAY), 'd']
  if (u === 'now') return 'just now'
  return diff >= 0 ? `${v}${u} ago` : `in ${v}${u}`
}

/** Countdown text for a deadline: "2h 14m", "3d 4h", "closed". */
export function countdown(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso) - now
  if (ms <= 0) return 'closed'
  const m = Math.floor(ms / 60_000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m}m`
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
