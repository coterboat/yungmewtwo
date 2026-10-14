// The directory: every store near either of you, with what the log says about each.
import { EyeOff, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast, withToast } from '../../components/toast.tsx'
import { Badge, Button, Card, Chips, Empty, Input, cx } from '../../components/ui.tsx'
import { bestWindow, storeStatus } from '../../lib/hunt.ts'
import { sightingLine } from '../../lib/huntLog.ts'
import { chainCounts, filterViews, sortByMiles, viewStores, type StoreView } from '../../lib/huntStores.ts'
import { personName } from '../../lib/people.ts'
import type { Store } from '../../lib/user.ts'
import { updateUserFile } from '../../lib/userData.ts'
import { ChainBadge } from './bits.tsx'
import { useHasKey, type HuntData } from './useHunt.ts'

const PAGE = 40

export function StoreRow({ view, data, onOpen }: { view: StoreView; data: HuntData; onOpen: (id: string) => void }) {
  const { store } = view
  const sightings = data.byStore.get(store.id) ?? []
  const status = storeStatus(sightings)
  const grid = data.models.store.get(store.id)
  const best = grid ? bestWindow(grid) : null
  const last = sightings[0]

  return (
    <Card onClick={() => onOpen(store.id)} className="p-3.5">
      <div className="flex items-start gap-3">
        <ChainBadge chain={store.chain} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="truncate text-[15px] font-semibold">{store.name}</h3>
            <span className="shrink-0 text-[12.5px] text-ink-2 tabular">
              {view.miles != null ? `${view.miles.toFixed(1)} mi` : ''}
              {view.whose ? ` · ${personName(data.people, view.whose)}` : ''}
            </span>
          </div>
          <p className="truncate text-[12.5px] text-ink-3">
            {store.chain}
            {store.address ? ` · ${store.address}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px]">
            {last ? (
              <span className="font-medium text-ink-2">{sightingLine(last, personName(data.people, last.by), data.now)}</span>
            ) : (
              <span className="text-ink-3">No visits logged yet</span>
            )}
            {best && status.n >= 2 && (
              <Badge tone={status.n >= 3 ? 'accent' : 'neutral'} className={cx(status.n < 3 && 'border border-dashed border-line-strong')}>
                {status.n >= 3 ? 'Best' : 'Hunch'}: {best.label}
              </Badge>
            )}
            {status.n > 0 && (
              <span className="text-ink-3">
                {status.hits} of {status.n} {status.n === 1 ? 'visit' : 'visits'} had stock
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

export function StoreList({ data, scope, onOpen, onAdd }: { data: HuntData; scope: string; onOpen: (id: string) => void; onAdd: () => void }) {
  const [query, setQuery] = useState('')
  const [chain, setChain] = useState('all')
  const [shown, setShown] = useState(PAGE)
  const [showHidden, setShowHidden] = useState(false)
  const canPost = useHasKey()

  const base = useMemo(() => sortByMiles(viewStores(data.stores, scope)), [data.stores, scope])
  const hiddenViews = useMemo(() => sortByMiles(viewStores(data.stores, scope, { hidden: true })), [data.stores, scope])
  const counts = useMemo(() => chainCounts(base), [base])
  const rows = useMemo(() => filterViews(base, { chain, query }), [base, chain, query])

  function unhide(s: Store) {
    if (!canPost || !data.me) {
      toast('Add your posting key in Settings to change stores.', 'error')
      return
    }
    void withToast(
      () => updateUserFile<Store>('stores', (cur) => cur.map((x) => (x.id === s.id ? { ...x, hidden: undefined } : x)), `hunt: ${data.me!.name} unhid ${s.name}`),
      `${s.name} is back`,
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            aria-label="Search stores"
            placeholder="Search by name, chain, street or town"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setShown(PAGE)
            }}
            className="pl-9"
          />
        </div>
        <Button onClick={onAdd} aria-label="Add a store">
          <Plus size={18} aria-hidden />
          <span className="hidden sm:inline">Add store</span>
        </Button>
      </div>
      <div className="mb-4">
        <Chips
          value={chain}
          onChange={(c) => {
            setChain(c)
            setShown(PAGE)
          }}
          options={[{ value: 'all', label: 'All', count: base.length }, ...counts.map((c) => ({ value: c.chain, label: c.chain, count: c.count }))]}
        />
      </div>

      {base.length === 0 ? (
        <Empty title="No stores in this area yet" action={<Button onClick={onAdd}>Add a store</Button>}>
          The directory comes from OpenStreetMap. You can also add a store by hand.
        </Empty>
      ) : rows.length === 0 ? (
        <Empty title="No stores match">Try a different word, or pick All chains.</Empty>
      ) : (
        <>
          <p className="mb-2 text-[12.5px] text-ink-3">
            {rows.length} {rows.length === 1 ? 'store' : 'stores'}, nearest first
          </p>
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {rows.slice(0, shown).map((v) => (
              <StoreRow key={v.store.id} view={v} data={data} onOpen={onOpen} />
            ))}
          </div>
          {rows.length > shown && (
            <div className="mt-4 text-center">
              <Button onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more</Button>
            </div>
          )}
        </>
      )}

      {hiddenViews.length > 0 && (
        <div className="mt-8">
          <button type="button" onClick={() => setShowHidden((h) => !h)} aria-expanded={showHidden} className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-2 hover:text-ink">
            <EyeOff size={16} aria-hidden /> Hidden stores ({hiddenViews.length})
          </button>
          {showHidden && (
            <ul className="mt-2 grid grid-cols-1 gap-2">
              {hiddenViews.map((v) => (
                <li key={v.store.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
                  <ChainBadge chain={v.store.chain} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{v.store.name}</span>
                  <Button size="sm" onClick={() => unhide(v.store)}>
                    Unhide
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
