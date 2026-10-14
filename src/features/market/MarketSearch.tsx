// Full-page search: the filter panel, the removable filter chips, and the results list.
import { SearchX, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ProductRow, setLabel } from '../../components/product.tsx'
import { Button, Card, Empty, Field, Input, Segmented, Select, Skeleton } from '../../components/ui.tsx'
import { money, num, shortDate } from '../../lib/format.ts'
import { displayName, filterRows, NO_FILTERS, rarityOptions, SEARCH_POOL, setPickerOrder, type KindFilter, type SearchFilters, type SortMode } from '../../lib/market.ts'
import { todayIso, useHistoryStatus } from '../../lib/market-hooks.ts'
import { FieldGroup } from './parts.tsx'
import type { IndexRow, SetSummary } from '../../lib/site.ts'

const PAGE = 50

/** A price box that keeps what you typed ("12.") while only committing real numbers. */
function PriceInput({ label, value, onCommit, placeholder }: { label: string; value: number | null; onCommit: (v: number | null) => void; placeholder: string }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => {
    const parsed = text.trim() === '' ? null : Number(text)
    if (parsed !== value) setText(value == null ? '' : String(value))
    // Only react to the URL changing underneath us (e.g. Clear), not to our own typing.
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Field label={label}>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden>
          $
        </span>
        <Input
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          className="pl-7 tabular"
          onChange={(e) => {
            const t = e.target.value.replace(/[^0-9.]/g, '')
            setText(t)
            const n = t.trim() === '' ? null : Number(t)
            onCommit(n != null && Number.isFinite(n) ? n : null)
          }}
        />
      </div>
    </Field>
  )
}

export function FilterPanel({ filters, onChange, lang, rows, sets }: { filters: SearchFilters; onChange: (patch: Partial<SearchFilters>) => void; lang: 'EN' | 'JP'; rows: IndexRow[] | undefined; sets: SetSummary[] | undefined }) {
  const status = useHistoryStatus()
  const setOptions = useMemo(() => (sets ? setPickerOrder(sets, lang, status?.first, todayIso()) : []), [sets, lang, status?.first])
  const rarities = useMemo(() => (rows ? rarityOptions(rows, filters.kind) : []), [rows, filters.kind])
  const changeReady = !!status?.ready[7]
  return (
    <Card className="mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <FieldGroup label="Type" className="sm:col-span-2 lg:col-span-1">
        <Segmented<KindFilter>
          className="flex w-full [&>button]:flex-1"
          value={filters.kind}
          onChange={(kind) => onChange({ kind, rarity: kind === 's' ? null : filters.rarity })}
          options={[
            { value: 'all', label: 'All' },
            { value: 'c', label: 'Cards' },
            { value: 's', label: 'Sealed' },
          ]}
        />
      </FieldGroup>
      <Field label="Set">
        <Select value={filters.set ?? ''} onChange={(e) => onChange({ set: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Any set</option>
          {setOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {setLabel(s)}
              {s.abbr ? ` (${s.abbr})` : ''}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Rarity">
        <Select value={filters.rarity ?? ''} disabled={filters.kind === 's'} onChange={(e) => onChange({ rarity: e.target.value || null })}>
          <option value="">Any rarity</option>
          {rarities.map((r) => (
            <option key={r.value} value={r.value}>
              {r.value} ({num(r.count)})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Sort by">
        <Select value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as SortMode })}>
          <option value="relevance">Best match</option>
          <option value="price-desc">Price: high to low</option>
          <option value="price-asc">Price: low to high</option>
          <option value="up" disabled={!changeReady}>
            7-day risers{changeReady ? '' : status?.appears[7] ? ` (from ${shortDate(status.appears[7])})` : ''}
          </option>
          <option value="down" disabled={!changeReady}>
            7-day fallers{changeReady ? '' : status?.appears[7] ? ` (from ${shortDate(status.appears[7])})` : ''}
          </option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:col-span-2">
        <PriceInput label="Min price" value={filters.min} placeholder="0" onCommit={(min) => onChange({ min })} />
        <PriceInput label="Max price" value={filters.max} placeholder="Any" onCommit={(max) => onChange({ max })} />
      </div>
    </Card>
  )
}

export function ActiveFilters({ filters, onChange, setName }: { filters: SearchFilters; onChange: (patch: Partial<SearchFilters>) => void; setName: string | undefined }) {
  const chips: Array<{ key: string; label: string; clear: Partial<SearchFilters> }> = []
  if (filters.kind !== 'all') chips.push({ key: 'kind', label: filters.kind === 'c' ? 'Cards' : 'Sealed', clear: { kind: 'all' } })
  if (filters.set != null) chips.push({ key: 'set', label: setName ?? `Set ${filters.set}`, clear: { set: null } })
  if (filters.rarity) chips.push({ key: 'rarity', label: filters.rarity, clear: { rarity: null } })
  if (filters.min != null || filters.max != null) {
    const label = filters.min != null && filters.max != null ? `${money(filters.min)} to ${money(filters.max)}` : filters.min != null ? `${money(filters.min)} and up` : `Up to ${money(filters.max)}`
    chips.push({ key: 'price', label, clear: { min: null, max: null } })
  }
  if (!chips.length) return null
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.clear)}
          aria-label={`Remove filter: ${c.label}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-accent bg-accent-soft pr-2 pl-3 text-[13px] font-medium"
        >
          {c.label}
          <X size={14} aria-hidden />
        </button>
      ))}
      <button type="button" onClick={() => onChange({ ...NO_FILTERS, q: filters.q, sort: filters.sort })} className="min-h-9 px-2 text-[13px] text-ink-3 hover:text-ink">
        Clear all
      </button>
    </div>
  )
}

export function SearchResults({ filters, rows, loading, sets, setMap, onClear }: { filters: SearchFilters; rows: IndexRow[] | undefined; loading: boolean; sets: Map<number, SetSummary> | undefined; setMap: Map<number, SetSummary> | undefined; onClear: () => void }) {
  const [shown, setShown] = useState(PAGE)
  useEffect(() => setShown(PAGE), [filters])
  const result = useMemo(() => (rows ? filterRows(rows, filters, sets) : undefined), [rows, filters, sets])
  if (loading || !result) return <Skeleton className="h-64" />
  if (!result.total) {
    return (
      <Empty icon={<SearchX size={20} />} title="No matches" action={<Button onClick={onClear}>Clear search and filters</Button>}>
        {filters.q.trim() ? 'Try fewer words, or search by set name or card number. Shorthand works too: etb, pc etb, sir, ir, bb, upc. Cards without a market price are hidden when a price range is set.' : 'Nothing fits those filters. Try widening the price range or removing one.'}
      </Empty>
    )
  }
  const visible = result.rows.slice(0, shown)
  return (
    <div>
      <p className="mb-2 text-[13px] text-ink-3">
        {result.total >= SEARCH_POOL ? `${num(SEARCH_POOL)}+` : num(result.total)} {result.total === 1 ? 'result' : 'results'}
        {result.total > result.rows.length && ` · showing the first ${num(result.rows.length)}`}
      </p>
      <Card className="divide-y divide-line p-1.5">
        {visible.map((row) => (
          <ProductRow key={row[0]} id={row[0]} name={displayName(row[1])} kind={row[3]} set={setMap?.get(row[2])} num={row[4]} rarity={row[5] && row[5] !== 'None' ? row[5] : undefined} variant={row[6]} market={row[7]} change={row[8] ?? undefined} to={`/item/${row[0]}`} />
        ))}
      </Card>
      {result.rows.length > shown && (
        <div className="mt-3 text-center">
          <Button onClick={() => setShown(shown + PAGE)}>Show more</Button>
        </div>
      )}
    </div>
  )
}
