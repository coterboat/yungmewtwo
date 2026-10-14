// The shared UI kit. Feature screens compose these instead of styling from scratch, so the
// whole app reads as one thing.
import { ArrowDownRight, ArrowUpRight, X } from 'lucide-react'
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { money, pct } from '../lib/format.ts'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

// ---------- surfaces ----------

export function Card({ children, className, to, onClick, holo }: { children: ReactNode; className?: string; to?: string; onClick?: () => void; holo?: boolean }) {
  const cls = cx(
    'block min-w-0 rounded-2xl border border-line bg-surface shadow-card',
    (to || onClick) && 'transition hover:border-line-strong active:scale-[0.995]',
    holo && 'holo-ring border-transparent',
    className,
  )
  if (to)
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cx(cls, 'w-full text-left')}>
        {children}
      </button>
    )
  return <div className={cls}>{children}</div>
}

export function Section({ title, sub, action, children, className, id }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx('mb-7', className)}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
          {sub && <p className="mt-0.5 text-[13px] text-ink-3">{sub}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

export function PageHeader({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// ---------- controls ----------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({ variant = 'secondary', size = 'md', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl font-medium transition select-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
        size === 'sm' ? 'min-h-9 px-3 text-[13px]' : 'px-4 text-sm',
        variant === 'primary' && 'bg-accent text-accent-ink hover:bg-accent-strong',
        variant === 'secondary' && 'border border-line bg-surface-2 text-ink hover:border-line-strong',
        variant === 'ghost' && 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        variant === 'danger' && 'border border-line bg-surface-2 text-down hover:border-down',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({ options, value, onChange, className, size = 'md' }: { options: Array<{ value: T; label: ReactNode }>; value: T; onChange: (v: T) => void; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" className={cx('inline-flex rounded-xl border border-line bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-[10px] font-medium transition whitespace-nowrap',
            size === 'sm' ? 'min-h-8 px-2.5 text-[12px]' : 'min-h-9 px-3 text-[13px]',
            o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chips<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: ReactNode; count?: number }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition',
            o.value === value ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
          {o.count != null && <span className="text-ink-3 tabular">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

const fieldCls = 'w-full min-h-11 rounded-xl border border-line bg-surface-2 px-3 text-[15px] text-ink placeholder:text-ink-3 outline-none transition focus:border-accent'

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ink-3">{hint}</span>}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldCls, props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(fieldCls, 'py-2.5', props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(fieldCls, 'appearance-none pr-8', props.className)} />
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-surface-3')}
      >
        <span className={cx('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-6' : 'left-1')} />
      </button>
    </label>
  )
}

// ---------- labels & numbers ----------

type Tone = 'neutral' | 'accent' | 'good' | 'warning' | 'critical' | 'holo'

export function Badge({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap',
        tone === 'neutral' && 'bg-surface-3 text-ink-2',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'good' && 'bg-[color-mix(in_srgb,var(--good)_16%,transparent)] text-up',
        tone === 'warning' && 'bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] text-ink',
        tone === 'critical' && 'bg-[color-mix(in_srgb,var(--critical)_18%,transparent)] text-down',
        tone === 'holo' && 'holo-ring bg-surface-2 text-ink',
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/** Signed % change with an arrow; up/down colors (never color alone: the arrow and sign carry it). */
export function Delta({ value, className, digits = 1 }: { value: number | null | undefined; className?: string; digits?: number }) {
  if (value == null) return <span className={cx('text-ink-3 tabular', className)}>—</span>
  const up = value > 0
  const flat = Math.abs(value) < 0.0005
  return (
    <span className={cx('inline-flex items-center gap-0.5 font-medium tabular', flat ? 'text-ink-3' : up ? 'text-up' : 'text-down', className)}>
      {!flat && (up ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />)}
      {pct(value, digits)}
    </span>
  )
}

export function Money({ value, className, compact }: { value: number | null | undefined; className?: string; compact?: boolean }) {
  return <span className={cx('tabular', className)}>{money(value, { compact })}</span>
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="mt-0.5 truncate text-lg font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>}
    </div>
  )
}

// ---------- states ----------

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center">
      {icon && <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-sm text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-surface-2', className)} />
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-down/40 bg-[color-mix(in_srgb,var(--critical)_10%,transparent)] px-4 py-3 text-sm text-ink">{children}</div>
}

// ---------- overlays ----------

/** Bottom sheet on phones, centered dialog on wider screens. Esc and backdrop close it. */
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.querySelector<HTMLElement>('input,textarea,select,button')?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        className={cx(
          'fade-in relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-2xl sm:rounded-3xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  )
}
