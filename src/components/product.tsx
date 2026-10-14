// Product building blocks: thumbnail, list row, and the search-and-pick sheet used everywhere a
// card or sealed item gets chosen (watch, vault, deals, tools).
import { Search } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { productImage, variantLabel } from '../lib/classify.ts'
import { useIndex, useSetMap } from '../lib/data.ts'
import { usePrefs } from '../lib/prefs.ts'
import { searchIndex } from '../lib/search.ts'
import type { IndexRow, SetSummary } from '../lib/site.ts'
import { Badge, Delta, Input, Money, Segmented, Sheet, Skeleton, cx } from './ui.tsx'

export function ProductThumb({ id, kind = 'card', size = 'md', className }: { id: number; kind?: 'card' | 'sealed' | 'c' | 's'; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const [failed, setFailed] = useState(false)
  const card = kind === 'card' || kind === 'c'
  const w = size === 'sm' ? 'w-9' : size === 'md' ? 'w-12' : 'w-full'
  return (
    <div className={cx('shrink-0 overflow-hidden rounded-md bg-surface-2', card ? 'aspect-[63/88]' : 'aspect-square', w, className)}>
      {!failed && (
        <img
          src={productImage(id, size === 'lg' ? 400 : 200)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={cx('h-full w-full', card ? 'object-cover' : 'object-contain')}
        />
      )}
    </div>
  )
}

export function setLabel(set: SetSummary | undefined): string {
  if (!set) return ''
  return set.name.replace(/^(ME|SV|SWSH|SM|XY)\d+(\.\d+)?:\s*/, '')
}

/** One product in a list: thumb, name, set · number, price and change. */
export function ProductRow({
  id,
  name,
  kind,
  set,
  num,
  rarity,
  variant,
  market,
  change,
  right,
  to,
  onClick,
}: {
  id: number
  name: string
  kind: 'card' | 'sealed' | 'c' | 's'
  set?: SetSummary
  num?: string
  rarity?: string
  variant?: string
  market?: number | null
  change?: number | null
  right?: ReactNode
  to?: string
  onClick?: () => void
}) {
  const body = (
    <>
      <ProductThumb id={id} kind={kind} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-3">
          {set && <span className="truncate">{setLabel(set)}</span>}
          {num && <span className="tabular">· {num}</span>}
          {variant && variant !== 'N' && variant !== 'H' && <span>· {variantLabel(variant)}</span>}
          {rarity && <span className="hidden truncate sm:inline">· {rarity}</span>}
          {set?.lang === 'JP' && <Badge className="!px-1.5 !py-0 !text-[10px]">JP</Badge>}
        </div>
      </div>
      {right ?? (
        <div className="shrink-0 text-right">
          <div className="text-[14px] font-semibold">
            <Money value={market} />
          </div>
          {change !== undefined && <Delta value={change} className="text-[12px]" />}
        </div>
      )}
    </>
  )
  const cls = 'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-surface-2'
  if (to)
    return (
      <a href={`#${to}`} className={cls}>
        {body}
      </a>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    )
  return <div className={cls}>{body}</div>
}

/** Search box + results over the EN or JP index. */
export function ProductSearch({ onPick, kind, autoFocus, placeholder }: { onPick: (row: IndexRow) => void; kind?: 'c' | 's'; autoFocus?: boolean; placeholder?: string }) {
  const prefs = usePrefs()
  const [lang, setLang] = useState<'EN' | 'JP'>(prefs.marketLang)
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const { data: rows, loading } = useIndex(lang)
  const sets = useSetMap()
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 120)
    return () => clearTimeout(t)
  }, [q])
  const hits = useMemo(() => (rows ? searchIndex(rows, debounced, sets, { kind, limit: 40 }) : []), [rows, debounced, sets, kind])
  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <Input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder ?? 'Search cards & sealed (e.g. "umbreon sir", "delta reign etb")'} className="pl-9" />
        </div>
        <Segmented size="sm" options={[{ value: 'EN', label: 'EN' }, { value: 'JP', label: 'JP' }]} value={lang} onChange={setLang} />
      </div>
      <div className="mt-3 min-h-24">
        {loading && <Skeleton className="h-24" />}
        {!loading && debounced && !hits.length && <p className="py-6 text-center text-sm text-ink-3">No matches. Try fewer words or the set name.</p>}
        <div className="-mx-2">
          {hits.map(({ row }) => (
            <ProductRow key={row[0]} id={row[0]} name={row[1]} kind={row[3]} set={sets?.get(row[2])} num={row[4]} variant={row[6]} market={row[7]} change={row[8]} onClick={() => onPick(row)} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function ProductPickerSheet({ open, onClose, onPick, title = 'Pick a product', kind }: { open: boolean; onClose: () => void; onPick: (row: IndexRow) => void; title?: string; kind?: 'c' | 's' }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} wide>
      <ProductSearch
        autoFocus
        kind={kind}
        onPick={(row) => {
          onPick(row)
          onClose()
        }}
      />
    </Sheet>
  )
}
