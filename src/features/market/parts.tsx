// Small pieces shared by the Market, Set and Item screens.
import { ChevronDown, Info, KeyRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Segmented, cx } from '../../components/ui.tsx'
import { shortDate } from '../../lib/format.ts'
import { daysBetween, historyNoteParts, rangeStart } from '../../lib/market.ts'
import { useCountUp, useHistoryStatus } from '../../lib/market-hooks.ts'
import { usePrefs } from '../../lib/prefs.ts'
import type { Person } from '../../lib/user.ts'
import { useJoinHint } from '../../lib/people.ts'

/** What price history exists and when changes start to show. One line until tapped; nothing once 30+ days are in. */
export function HistoryNote({ className }: { className?: string }) {
  const status = useHistoryStatus()
  const [open, setOpen] = useState(false)
  const parts = status && historyNoteParts(status, shortDate)
  if (!parts) return null
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      className={cx('flex w-full items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-left text-[13px] leading-snug text-ink-2', className)}
    >
      <Info size={15} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
      <span className="min-w-0 flex-1">
        {parts.lead}{' '}
        {open ? <span className="sm:hidden">{parts.detail}</span> : <span className="sm:hidden">{parts.next}</span>}
        <span className="hidden sm:inline">{parts.detail}</span>
      </span>
      <ChevronDown size={15} className={cx('mt-0.5 shrink-0 text-ink-3 transition sm:hidden', open && 'rotate-180')} aria-hidden />
    </button>
  )
}

/** Underlined tab strip that scrolls sideways on narrow screens. */
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: Array<{ value: T; label: ReactNode; count?: number }>; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cx('no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 lg:mx-0 lg:px-0', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cx(
            'relative inline-flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-[14px] font-medium whitespace-nowrap transition',
            t.value === value ? 'text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent' : 'text-ink-3 hover:text-ink',
          )}
        >
          {t.label}
          {t.count != null && t.count > 0 && <span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-semibold text-ink-2 tabular">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** A person's colored initial, so chips and rows say who without relying on color alone. */
export function PersonDot({ person, size = 20 }: { person: Person | undefined; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-black"
      style={{ width: size, height: size, fontSize: size * 0.55, background: person?.color ?? 'var(--surface-3)' }}
    >
      {person?.name.slice(0, 1) ?? '?'}
    </span>
  )
}

const RANGES = [
  { days: 30, label: '1M' },
  { days: 90, label: '3M' },
  { days: 365, label: '1Y' },
] as const

/** Picks how much history a chart shows. Offers only ranges shorter than the data, and nothing until there is over a month. */
export function useChartRange(dates: string[]) {
  const [days, setDays] = useState<number | null>(null)
  const span = dates.length > 1 ? daysBetween(dates[0], dates[dates.length - 1]) : 0
  const options = span > 31 ? [...RANGES.filter((r) => r.days < span).map((r) => ({ value: String(r.days), label: r.label })), { value: 'all', label: 'All' }] : []
  const start = rangeStart(dates, days)
  const control = options.length ? <Segmented size="sm" value={days == null ? 'all' : String(days)} onChange={(v) => setDays(v === 'all' ? null : Number(v))} options={options} /> : null
  return { start, control }
}

/** Shown in place of a save button when this device has no posting key. */
export function NeedKey({ className }: { className?: string }) {
  const { token } = usePrefs()
  const hint = useJoinHint()
  if (token) return null
  return (
    <div className={cx('flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[13px] text-ink-2', className)}>
      <KeyRound size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
      <p>
        Saving needs your posting key.{' '}
        <Link to="/settings" className="font-medium text-accent underline underline-offset-2">
          Add it in Settings
        </Link>
        . {hint}
      </p>
    </div>
  )
}

/** Thin progress bar with a text label beside it, so the number carries the meaning, not the fill. */
export function Progress({ ratio, hit, className }: { ratio: number; hit?: boolean; className?: string }) {
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-surface-3', className)} role="presentation">
      <div className={cx('h-full rounded-full transition-all', hit ? 'bg-up' : 'bg-accent')} style={{ width: `${Math.max(3, Math.round(ratio * 100))}%` }} />
    </div>
  )
}

/** A number that eases up to its value (and says its final value to screen readers right away). */
export function CountUp({ value, format, className }: { value: number | null | undefined; format: (n: number) => string; className?: string }) {
  const shown = useCountUp(value)
  if (value == null || shown == null) return <span className={className}>—</span>
  return (
    <span className={cx('tabular', className)}>
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden>{format(shown)}</span>
    </span>
  )
}

/** A slow diagonal sheen across the thing inside `.mm-shimmer` (the top chase cards). Off under prefers-reduced-motion. */
export function ShimmerStyles() {
  return (
    <style>{`
.mm-shimmer{position:relative;overflow:hidden;isolation:isolate}
.mm-shimmer::after{content:'';position:absolute;inset:0;pointer-events:none;border-radius:inherit;opacity:.7;
background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.34) 46%,rgba(167,139,250,.30) 50%,rgba(125,211,252,.28) 54%,rgba(253,230,138,.22) 58%,transparent 68%);
transform:translateX(-130%);animation:mm-sheen 5.5s ease-in-out infinite}
.mm-shimmer:hover::after{animation-duration:1.6s}
@keyframes mm-sheen{0%,55%{transform:translateX(-130%)}100%{transform:translateX(130%)}}
@media (prefers-reduced-motion:reduce){.mm-shimmer::after{animation:none;opacity:0}}
`}</style>
  )
}

/** A labelled group of buttons (segmented control). Not a <label>, so the label text doesn't leak into each button's name. */
export function FieldGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={className}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
    </div>
  )
}
