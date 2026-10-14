// Pieces shared by the four tools: URL-backed inputs (so a result can be shared as a link),
// money fields, and a product field that opens the picker.
import { Search, X } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ProductPickerSheet, ProductThumb, setLabel } from '../../components/product.tsx'
import { Button, Field, Input, Select, Skeleton, cx } from '../../components/ui.tsx'
import { variantLabel } from '../../lib/classify.ts'
import { useProduct, useSetMap } from '../../lib/data.ts'
import { money } from '../../lib/format.ts'
import type { SiteProduct } from '../../lib/site.ts'

/** Reads and writes the query string with replace (no history spam), so inputs live in the URL. */
export function useQ() {
  const [sp, setSp] = useSearchParams()
  const get = useCallback((k: string) => sp.get(k) ?? '', [sp])
  const num = useCallback(
    (k: string): number | undefined => {
      const raw = sp.get(k)
      if (raw == null || raw.trim() === '') return undefined
      const n = Number(raw)
      return Number.isFinite(n) ? n : undefined
    },
    [sp],
  )
  const set = useCallback(
    (patch: Record<string, string | number | null | undefined>, keepEmpty = false) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || (v === '' && !keepEmpty)) next.delete(k)
            else next.set(k, String(v))
          }
          return next
        },
        { replace: true },
      )
    },
    [setSp],
  )
  /** A field that has a default: shows the default until typed over, and lets the box be emptied while editing. */
  const field = useCallback(
    (k: string, def: number | string) => ({
      value: sp.has(k) ? (sp.get(k) as string) : String(def),
      onChange: (v: string) => set({ [k]: v === String(def) ? null : v }, true),
    }),
    [sp, set],
  )
  return { get, num, set, field }
}

export type Q = ReturnType<typeof useQ>

export const cleanNumber = (s: string) => {
  const cleaned = s.replace(/[^0-9.]/g, '')
  const dot = cleaned.indexOf('.')
  return dot < 0 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '')
}

export function MoneyInput({ label, value, onChange, hint, placeholder, prefix = '$', suffix, className }: { label: ReactNode; value: string; onChange: (v: string) => void; hint?: ReactNode; placeholder?: string; prefix?: string; suffix?: string; className?: string }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3">{prefix}</span>}
        <Input inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(cleanNumber(e.target.value))} className={cx('tabular', prefix && 'pl-7', suffix && 'pr-9')} />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3">{suffix}</span>}
      </div>
    </Field>
  )
}

/** The product chosen for a tool: shows it with a way to change it, or a button to pick one. */
export function ProductField({ id, onPick, onClear, kind, label, empty }: { id: number | null; onPick: (id: number) => void; onClear: () => void; kind?: 'c' | 's'; label?: ReactNode; empty?: string }) {
  const [open, setOpen] = useState(false)
  const { data: product, loading } = useProduct(id)
  const sets = useSetMap()
  const shown = id ? product : undefined
  return (
    <div>
      {label && <div className="mb-1.5 text-[13px] font-medium text-ink-2">{label}</div>}
      {id && loading && !shown && <Skeleton className="h-16" />}
      {shown ? (
        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-2 pr-1">
          <button type="button" onClick={() => setOpen(true)} aria-label={`${shown.name}. Change product`} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl p-2.5 text-left">
            <ProductThumb id={shown.id} kind={shown.kind} size="md" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 block text-[14px] font-medium">{shown.name}</span>
              <span className="mt-0.5 block truncate text-[12px] text-ink-3">
                {setLabel(sets?.get(shown.set))}
                {shown.num ? ` · ${shown.num}` : ''}
              </span>
            </span>
          </button>
          <button type="button" onClick={onClear} aria-label="Clear product" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-ink">
            <X size={16} />
          </button>
        </div>
      ) : (
        !(id && loading) && (
          <Button onClick={() => setOpen(true)} className="w-full justify-start gap-2 text-ink-2">
            <Search size={16} /> {empty ?? 'Pick a card or sealed product'}
          </Button>
        )
      )}
      <ProductPickerSheet open={open} onClose={() => setOpen(false)} onPick={(row) => onPick(row[0])} kind={kind} title={kind === 's' ? 'Pick a sealed product' : 'Pick a product'} />
    </div>
  )
}

/** Variant picker for a card with more than one printing; renders nothing otherwise. */
export function VariantSelect({ product, value, onChange }: { product: SiteProduct | undefined; value: string; onChange: (v: string) => void }) {
  const codes = product ? Object.keys(product.v) : []
  if (codes.length < 2) return null
  return (
    <Field label="Printing">
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Most valuable ({variantLabel(codes.reduce((a, b) => ((product?.v[b][0] ?? 0) > (product?.v[a][0] ?? 0) ? b : a)))})</option>
        {codes.map((c) => (
          <option key={c} value={c}>
            {variantLabel(c)} · {money(product?.v[c][0] ?? product?.v[c][1])}
          </option>
        ))}
      </Select>
    </Field>
  )
}

/** A label/value line in a result table. */
export function Line({ label, value, sub, strong, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-4 py-2', className)}>
      <div className="min-w-0">
        <div className={cx('text-[14px]', strong ? 'font-semibold' : 'text-ink-2')}>{label}</div>
        {sub && <div className="text-[12px] text-ink-3">{sub}</div>}
      </div>
      <div className={cx('shrink-0 text-right tabular', strong ? 'text-[17px] font-semibold' : 'text-[14px] font-medium')}>{value}</div>
    </div>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-relaxed text-ink-3">{children}</p>
}

/** Signed dollars: +$12.40 / −$3.10, with the sign in text so color is never the only cue. */
export function signedMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  const m = money(Math.abs(n))
  return n > 0.004 ? `+${m}` : n < -0.004 ? `−${m}` : m
}

export const toneText = (n: number | null | undefined) => (n == null || Math.abs(n) < 0.005 ? 'text-ink-2' : n > 0 ? 'text-up' : 'text-down')
