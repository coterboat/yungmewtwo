// Market: search everything, then watchlist, movers, sealed vs MSRP, and sets.
import { Binoculars, ListFilter, PackageOpen, Layers, Search, TrendingUp, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Input, PageHeader, Segmented, Skeleton } from '../../components/ui.tsx'
import { useIndex, useMeta, useSetMap, useSets } from '../../lib/data.ts'
import { num, shortDate } from '../../lib/format.ts'
import { filtersFromParams, filtersToParams, isFiltering, NO_FILTERS, type SearchFilters } from '../../lib/market.ts'
import { useMe } from '../../lib/people.ts'
import { setPrefs, usePrefs } from '../../lib/prefs.ts'
import { setLabel } from '../../components/product.tsx'
import type { WatchItem } from '../../lib/user.ts'
import { useUserFile } from '../../lib/userData.ts'
import { ActiveFilters, FilterPanel, SearchResults } from './MarketSearch.tsx'
import { Movers } from './Movers.tsx'
import { HistoryNote, Tabs } from './parts.tsx'
import { SealedVsMsrp } from './SealedVsMsrp.tsx'
import { SetsGrid } from './SetsGrid.tsx'
import { Watchlist } from './Watchlist.tsx'

type Tab = 'watch' | 'movers' | 'msrp' | 'sets'
const TABS: Tab[] = ['watch', 'movers', 'msrp', 'sets']

export default function MarketPage() {
  const { marketLang: lang } = usePrefs()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => filtersFromParams(params), [params])
  const filtering = isFiltering(filters)
  const me = useMe()
  const { data: watch } = useUserFile<WatchItem>('watch')
  const { data: meta } = useMeta()
  const { data: setList } = useSets()
  const setMap = useSetMap()
  const { data: rows, loading: rowsLoading } = useIndex(lang)
  const [panel, setPanel] = useState(false)

  // What you type is local; it reaches the URL a beat later so Back returns to the same search.
  const [qInput, setQInput] = useState(filters.q)
  const pushedQ = useRef(filters.q)
  useEffect(() => {
    if (filters.q !== pushedQ.current) {
      pushedQ.current = filters.q
      setQInput(filters.q)
    }
  }, [filters.q])

  const update = useCallback(
    (patch: Partial<SearchFilters>) => {
      setParams((prev) => filtersToParams({ ...filtersFromParams(prev), ...patch }, prev), { replace: true })
    },
    [setParams],
  )
  useEffect(() => {
    if (qInput === pushedQ.current) return
    const t = setTimeout(() => {
      pushedQ.current = qInput
      update({ q: qInput })
    }, 160)
    return () => clearTimeout(t)
  }, [qInput, update])

  const mineCount = me && watch ? watch.filter((w) => w.by === me.id).length : 0
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : !watch || watch.length ? 'watch' : 'msrp'
  const setTab = (t: Tab) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    next.set('tab', t)
    return next
  }, { replace: true })

  const clearAll = () => {
    setQInput('')
    pushedQ.current = ''
    setParams((prev) => filtersToParams(NO_FILTERS, prev), { replace: true })
  }
  const focusSearch = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.getElementById('market-search')?.focus()
  }

  const activeCount = (filters.kind !== 'all' ? 1 : 0) + (filters.set != null ? 1 : 0) + (filters.rarity ? 1 : 0) + (filters.min != null || filters.max != null ? 1 : 0)

  return (
    <div>
      <PageHeader
        title="Market"
        sub={meta ? `Prices as of ${shortDate(meta.latest)} · ${num(meta.counts.priced)} priced products` : 'Loading prices…'}
        action={
          <Segmented
            value={lang}
            onChange={(v) => {
              setPrefs({ marketLang: v })
              if (filters.set != null) update({ set: null })
            }}
            options={[
              { value: 'EN', label: 'EN' },
              { value: 'JP', label: 'JP' },
            ]}
          />
        }
      />

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            id="market-search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={`Search ${lang} cards & sealed`}
            aria-label="Search the market"
            enterKeyHint="search"
            className="pr-10 pl-10"
          />
          {qInput && (
            <button type="button" aria-label="Clear search" onClick={() => setQInput('')} className="absolute top-1/2 right-1 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:text-ink">
              <X size={16} />
            </button>
          )}
        </div>
        <Button onClick={() => setPanel(!panel)} aria-expanded={panel} className="relative shrink-0">
          <ListFilter size={17} aria-hidden />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-ink">{activeCount}</span>}
        </Button>
      </div>

      {panel && <FilterPanel filters={filters} onChange={update} lang={lang} rows={rows} sets={setList} />}
      {!panel && <ActiveFilters filters={filters} onChange={update} setName={filters.set != null ? setLabel(setMap?.get(filters.set)) : undefined} />}

      <HistoryNote className="mb-4" />

      {filtering ? (
        <SearchResults filters={filters} rows={rows} loading={rowsLoading} sets={setMap} setMap={setMap} onClear={clearAll} />
      ) : qInput.trim() ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <Tabs<Tab>
            className="mb-5"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'watch', label: <><Binoculars size={16} className="hidden min-[430px]:block" aria-hidden /> Watchlist</>, count: mineCount },
              { value: 'movers', label: <><TrendingUp size={16} className="hidden min-[430px]:block" aria-hidden /> Movers</> },
              { value: 'msrp', label: <><PackageOpen size={16} className="hidden min-[430px]:block" aria-hidden /> Sealed vs MSRP</> },
              { value: 'sets', label: <><Layers size={16} className="hidden min-[430px]:block" aria-hidden /> Sets</> },
            ]}
          />
          <div role="tabpanel" className="fade-in" key={tab}>
            {tab === 'watch' && <Watchlist onFind={focusSearch} />}
            {tab === 'movers' && <Movers lang={lang} />}
            {tab === 'msrp' && <SealedVsMsrp lang={lang} />}
            {tab === 'sets' && <SetsGrid lang={lang} />}
          </div>
        </>
      )}
    </div>
  )
}
