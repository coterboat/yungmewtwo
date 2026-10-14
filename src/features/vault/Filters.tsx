// One row of filter chips above the collection. Each chip is a native select under the label,
// so phones get their own picker. Everything below the row (totals, charts, list) follows it.
import { ArrowUpDown, ChevronDown, RotateCcw } from 'lucide-react'
import { setLabel } from '../../components/product.tsx'
import { cx } from '../../components/ui.tsx'
import { DEFAULT_FILTERS, PRICE_BANDS, SORT_LABEL, isFiltered, type FilterOptions, type Filters, type SortKey } from '../../lib/vaultFilter.ts'
import type { SetSummary } from '../../lib/site.ts'

interface Opt {
  value: string
  label: string
}

function Chip({ label, valueLabel, options, value, onChange, icon }: { label: string; valueLabel?: string; options: Opt[]; value: string; onChange: (v: string) => void; icon?: boolean }) {
  const active = value !== ''
  return (
    <label className={cx('relative inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition', active ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-ink-2 hover:text-ink')}>
      {icon && <ArrowUpDown size={13} aria-hidden />}
      <span className="max-w-[10rem] truncate">{active ? <><span className="text-ink-3">{label}: </span>{valueLabel}</> : label}</span>
      <ChevronDown size={14} className="text-ink-3" aria-hidden />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function FilterRow({ filters, options, onChange }: { filters: Filters; options: FilterOptions; onChange: (f: Filters) => void }) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v })
  const setOpts: Opt[] = [{ value: '', label: 'Any set' }, ...options.sets.map((s) => ({ value: String(s.id), label: `${setLabel({ name: s.name } as SetSummary)}${s.lang === 'JP' ? ' (JP)' : ''} · ${s.count}` }))]
  const rarityOpts: Opt[] = [{ value: '', label: 'Any rarity' }, ...options.rarities.map((r) => ({ value: r.rarity, label: `${r.rarity} · ${r.count}` }))]
  const priceOpts: Opt[] = [{ value: '', label: 'Any price' }, ...PRICE_BANDS.map((b) => ({ value: b.value, label: b.label }))]
  const sortOpts: Opt[] = (Object.keys(SORT_LABEL) as SortKey[]).map((k) => ({ value: k, label: `Sort by ${SORT_LABEL[k].toLowerCase()}` }))
  const setName = options.sets.find((s) => s.id === filters.set)
  const priceLabel = PRICE_BANDS.find((b) => b.value === filters.price)?.label

  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0" role="group" aria-label="Filters">
      <Chip label="Set" valueLabel={setName ? setLabel({ name: setName.name } as SetSummary) : ''} options={setOpts} value={filters.set != null ? String(filters.set) : ''} onChange={(v) => set('set', v ? Number(v) : null)} />
      {(options.langs.length > 1 || filters.lang) && (
        <Chip label="Language" valueLabel={filters.lang ?? ''} options={[{ value: '', label: 'EN and JP' }, { value: 'EN', label: 'English' }, { value: 'JP', label: 'Japanese' }]} value={filters.lang ?? ''} onChange={(v) => set('lang', v === 'EN' || v === 'JP' ? v : null)} />
      )}
      <Chip label="Type" valueLabel={filters.kind === 'card' ? 'Cards' : 'Sealed'} options={[{ value: '', label: 'Cards and sealed' }, { value: 'card', label: 'Cards' }, { value: 'sealed', label: 'Sealed' }]} value={filters.kind ?? ''} onChange={(v) => set('kind', v === 'card' || v === 'sealed' ? v : null)} />
      <Chip label="Rarity" valueLabel={filters.rarity ?? ''} options={rarityOpts} value={filters.rarity ?? ''} onChange={(v) => set('rarity', v || null)} />
      <Chip label="Price" valueLabel={priceLabel} options={priceOpts} value={filters.price ?? ''} onChange={(v) => set('price', (v || null) as Filters['price'])} />
      <Chip label="Gain" valueLabel={filters.gain === 'win' ? 'Winners' : 'Losers'} options={[{ value: '', label: 'Winners and losers' }, { value: 'win', label: 'Winners only' }, { value: 'lose', label: 'Losers only' }]} value={filters.gain ?? ''} onChange={(v) => set('gain', v === 'win' || v === 'lose' ? v : null)} />
      <label className="relative inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[13px] font-medium text-ink-2 transition hover:text-ink">
        <ArrowUpDown size={13} aria-hidden />
        {SORT_LABEL[filters.sort]}
        <ChevronDown size={14} className="text-ink-3" aria-hidden />
        <select aria-label="Sort" value={filters.sort} onChange={(e) => set('sort', e.target.value as SortKey)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
          {sortOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {isFiltered(filters) && (
        <button type="button" onClick={() => onChange({ ...DEFAULT_FILTERS, sort: filters.sort })} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ink-3 hover:text-ink">
          <RotateCcw size={13} aria-hidden /> Reset
        </button>
      )}
    </div>
  )
}
