// Small pieces the Drops sections share.
import { TriangleAlert } from 'lucide-react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { Badge, cx } from '../../components/ui.tsx'
import type { Confidence } from '../../lib/drops.ts'

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  if (confidence === 'low')
    return (
      <Badge tone="warning" icon={<TriangleAlert size={12} aria-hidden />}>
        Rumor
      </Badge>
    )
  return <Badge tone={confidence === 'high' ? 'good' : 'neutral'}>{confidence === 'high' ? 'Confirmed' : 'Likely'}</Badge>
}

export function RegionBadge({ region }: { region: 'EN' | 'JP' }) {
  return <Badge tone={region === 'EN' ? 'accent' : 'neutral'}>{region === 'EN' ? 'English' : 'Japanese'}</Badge>
}

/** An anchor that looks like the kit's Button (the kit has no link variant). */
export function LinkButton({ variant = 'secondary', className, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: 'primary' | 'secondary' }) {
  return (
    <a
      {...rest}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-medium transition select-none active:scale-[0.98]',
        variant === 'primary' ? 'bg-accent text-accent-ink hover:bg-accent-strong' : 'border border-line bg-surface-2 text-ink hover:border-line-strong',
        className,
      )}
    >
      {children}
    </a>
  )
}

/** A small icon + text line used for facts on a release. */
export function Fact({ icon, label, children, className }: { icon: ReactNode; label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex min-w-0 gap-2.5', className)}>
      <span className="mt-0.5 shrink-0 text-ink-3" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[12px] text-ink-3">{label}</div>
        <div className="text-[13.5px] text-ink">{children}</div>
      </div>
    </div>
  )
}
