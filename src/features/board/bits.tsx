// Small pieces shared by the Board, Settings and Join screens: avatars, author chips, a live
// countdown, link-styled buttons and the "add your posting key" prompt.
import { KeyRound } from 'lucide-react'
import { useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../../components/ui.tsx'
import { formatCountdown } from '../../lib/board.ts'
import { useJoinHint } from '../../lib/people.ts'
import { inkFor } from '../../lib/peopleEdit.ts'
import type { Person } from '../../lib/user.ts'

/** Re-renders on an interval; the value is Date.now(). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** 2 on tablet-and-up widths, 1 on phones: how many columns of cards to lay out. */
export function useColumns(): 1 | 2 {
  const query = '(min-width: 768px)'
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const on = () => setWide(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide ? 2 : 1
}

export function Avatar({ person, size = 28, className }: { person: Person | undefined; size?: number; className?: string }) {
  const color = person?.color ?? 'var(--surface-3)'
  return (
    <span
      aria-hidden
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-bold', className)}
      style={{ width: size, height: size, background: color, color: person ? inkFor(person.color) : 'var(--text-2)', fontSize: Math.round(size * 0.46) }}
    >
      {person?.name.trim().slice(0, 1).toUpperCase() ?? '?'}
    </span>
  )
}

/** Who posted, in their color. */
export function AuthorChip({ person, fallback }: { person: Person | undefined; fallback?: string }) {
  const color = person?.color
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-[12.5px] font-medium"
      style={color ? { background: `color-mix(in srgb, ${color} 16%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 40%, transparent)` } : { background: 'var(--surface-2)' }}
    >
      <Avatar person={person} size={22} />
      <span className="truncate">{person?.name ?? fallback ?? 'Someone'}</span>
    </span>
  )
}

/** Ticks every second in the last hour, every 15 seconds before that. Shows "closed" at zero. */
export function Countdown({ to, className, closedLabel = 'closed' }: { to: string; className?: string; closedLabel?: string }) {
  const target = Date.parse(to)
  const [now, setNow] = useState(() => Date.now())
  const left = target - now
  const closed = left <= 0
  const step = left < 3_600_000 ? 1000 : 15_000
  useEffect(() => {
    setNow(Date.now())
    if (closed) return
    const id = setInterval(() => setNow(Date.now()), step)
    return () => clearInterval(id)
  }, [target, step, closed])
  return (
    <span role="timer" className={cx('tabular', className)}>
      {left <= 0 ? closedLabel : formatCountdown(left)}
    </span>
  )
}

const linkBtn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-medium transition select-none active:scale-[0.98]'

/** An <a> that looks like the kit's Button (the kit's Button only renders <button>). */
export function LinkButton({ variant = 'secondary', className, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: 'primary' | 'secondary' | 'ghost'; children: ReactNode }) {
  return (
    <a
      {...rest}
      className={cx(
        linkBtn,
        variant === 'primary' && 'bg-accent text-accent-ink hover:bg-accent-strong',
        variant === 'secondary' && 'border border-line bg-surface-2 text-ink hover:border-line-strong',
        variant === 'ghost' && 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        className,
      )}
    >
      {children}
    </a>
  )
}

/** Opens an external page in a new tab. */
export function ExternalLinkButton(props: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'target' | 'rel'> & { variant?: 'primary' | 'secondary' | 'ghost'; children: ReactNode }) {
  return <LinkButton {...props} target="_blank" rel="noopener noreferrer" />
}

/** Shown wherever an action needs a posting key and this device doesn't have one yet. */
export function NeedKeyNote({ what = 'post and respond', className, onNavigate }: { what?: string; className?: string; onNavigate?: () => void }) {
  const hint = useJoinHint()
  return (
    <div className={cx('flex items-start gap-3 rounded-2xl border border-line bg-accent-soft px-4 py-3 text-sm', className)}>
      <KeyRound size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
      <p className="min-w-0 text-ink-2">
        <span className="font-medium text-ink">You're read-only on this device.</span> To {what}, add your posting key in{' '}
        <Link to="/settings" onClick={onNavigate} className="font-medium text-accent underline underline-offset-2">
          Settings
        </Link>
        . {hint}
      </p>
    </div>
  )
}
