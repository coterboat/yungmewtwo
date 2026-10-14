// Small shared pieces of the Hunt screens.
import { KeyRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge, cx } from '../../components/ui.tsx'
import { chainMeta } from '../../lib/huntChains.ts'
import { resultLabel } from '../../lib/huntLog.ts'
import { RESULT_ICON } from './icons.ts'
import type { Person, SightingResult } from '../../lib/user.ts'

/** Colored initials for a chain. Always sits next to the chain's name, so color is never alone. */
export function ChainBadge({ chain, size = 'md' }: { chain: string; size?: 'sm' | 'md' | 'lg' }) {
  const m = chainMeta(chain)
  return (
    <span
      aria-hidden
      className={cx('inline-flex shrink-0 items-center justify-center rounded-xl font-bold tracking-tight', size === 'sm' ? 'h-8 w-8 text-[11px]' : size === 'lg' ? 'h-12 w-12 text-[15px]' : 'h-10 w-10 text-[13px]')}
      style={{ background: m.bg, color: m.fg }}
    >
      {m.initials}
    </span>
  )
}

const RESULT_TONE = { stocked: 'good', limited: 'warning', empty: 'critical', restocking: 'holo' } as const

export function ResultBadge({ result, className }: { result: SightingResult; className?: string }) {
  const Icon = RESULT_ICON[result]
  return (
    <Badge tone={RESULT_TONE[result]} className={className} icon={<Icon size={12} aria-hidden />}>
      {resultLabel(result)}
    </Badge>
  )
}

/** A small colored dot + initial for who logged something. */
export function PersonDot({ person }: { person: Person | undefined }) {
  return (
    <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-black" style={{ background: person?.color ?? 'var(--surface-3)' }}>
      {person?.name.slice(0, 1) ?? '?'}
    </span>
  )
}

/** Shown wherever saving needs a posting key or to know who you are. */
export function KeyNote({ canPost, hasMe, what }: { canPost: boolean; hasMe: boolean; what: ReactNode }) {
  if (canPost && hasMe) return null
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-sm text-ink-2">
      <KeyRound size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
      <p>
        {!canPost ? (
          <>
            <Link to="/settings" className="font-semibold text-accent underline underline-offset-2">
              Add your posting key in Settings
            </Link>{' '}
            to {what}. (Ask for the join link if you don't have one.)
          </>
        ) : (
          <>Pick who you are (top right) to {what}.</>
        )}
      </p>
    </div>
  )
}

/** An external link that looks like a secondary Button. */
export function LinkButton({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 px-4 text-sm font-medium text-ink transition select-none hover:border-line-strong active:scale-[0.98]',
        className,
      )}
    >
      {children}
    </a>
  )
}
