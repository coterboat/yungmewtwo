// The Vault: your library. What you have, want, are trading and sold, what it's worth, how close
// your sets are to done, and what to sell to fund the next thing you're hunting.
import { BookOpen, Download, Gem, LayoutList, Plus, ScanLine } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ProductPickerSheet, setLabel } from '../../components/product.tsx'
import { toast, withToast } from '../../components/toast.tsx'
import { Button, Empty, PageHeader, Segmented, Skeleton } from '../../components/ui.tsx'
import { useData, useSealed, useSetMap } from '../../lib/data.ts'
import { newId } from '../../lib/format.ts'
import { personName, usePeople } from '../../lib/people.ts'
import { usePrefs } from '../../lib/prefs.ts'
import type { SetHistory } from '../../lib/site.ts'
import type { VaultItem, VaultStatus, WatchItem } from '../../lib/user.ts'
import { updateUserFile, useUserFile } from '../../lib/userData.ts'
import { isHeld, quoteFor, splitLot, summarize, valueItem, valueSeries, type Holding } from '../../lib/vault.ts'
import { breakdown } from '../../lib/vaultBreakdown.ts'
import { addItem, removeItem, updateItem, type ItemPatch } from '../../lib/vaultEdit.ts'
import { vaultCsv, vaultCsvFilename } from '../../lib/vaultExport.ts'
import { applyFilters, filterOptions, filtersFromParams, filtersToParams, isFiltered, sortRows, DEFAULT_FILTERS, type Filters, type VaultRow } from '../../lib/vaultFilter.ts'
import { buildUnits } from '../../lib/vaultFun.ts'
import { movers, periodChange } from '../../lib/vaultMovers.ts'
import { ownedBySet, setProgress, sortProgress } from '../../lib/vaultSets.ts'
import { tradeMatches } from '../../lib/vaultTrade.ts'
import { Binder } from './Binder.tsx'
import { Confetti, KeyPrompt, useCanWrite } from './common.tsx'
import { FilterRow } from './Filters.tsx'
import { FlipToFund } from './FlipToFund.tsx'
import { Movers, SetCompletion, ValueBreakdown } from './Insights.tsx'
import { ItemList, itemName, type RowActions } from './ItemList.tsx'
import { AddSheet, EditSheet, SoldSheet } from './Sheets.tsx'
import { Summary } from './Summary.tsx'
import { TradeMatchesCard } from './TradeMatches.tsx'
import { useVaultCatalog } from './useVaultCatalog.ts'

const TABS: VaultStatus[] = ['have', 'want', 'trade', 'sold']
const TAB_LABEL: Record<VaultStatus, string> = { have: 'Have', want: 'Want', trade: 'Trade', sold: 'Sold' }
const EMPTY_COPY: Record<VaultStatus, string> = {
  have: 'Cards and sealed product you own show up here.',
  want: "The hunt list. Add what you're after and the Flip to fund tool will tell you what to sell to get it.",
  trade: 'Flag something for trade and your cousin sees it in their trade matches.',
  sold: 'Mark something as sold to track what you actually made.',
}

const NO_ITEMS: VaultItem[] = []
const today = () => new Date().toISOString().slice(0, 10)

function download(filename: string, text: string) {
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function VaultPage() {
  const navigate = useNavigate()
  const people = usePeople()
  const prefs = usePrefs()
  const canWrite = useCanWrite()
  const mineId = people.find((p) => p.id === prefs.me)?.id ?? people[0].id
  const otherId = people.find((p) => p.id !== mineId)?.id ?? mineId
  const [sp, setSp] = useSearchParams()
  const who = sp.get('who')
  const viewId = who === otherId ? otherId : mineId
  const editable = viewId === mineId
  const tab: VaultStatus = TABS.includes(sp.get('tab') as VaultStatus) ? (sp.get('tab') as VaultStatus) : 'have'
  const view = sp.get('view') === 'binder' ? 'binder' : 'list'
  const filters = useMemo(() => filtersFromParams(sp), [sp])

  const setParams = useCallback((patch: Record<string, string | null>) => setSp((prev) => {
    const next = new URLSearchParams(prev)
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k)
      else next.set(k, v)
    }
    return next
  }, { replace: true }), [setSp])
  const setFilters = useCallback((f: Filters) => setSp((prev) => filtersToParams(f, prev), { replace: true }), [setSp])

  // ----- data -----
  const mineFile = useUserFile<VaultItem>(`vault-${mineId}`)
  const otherFile = useUserFile<VaultItem>(`vault-${otherId}`)
  const watchFile = useUserFile<WatchItem>('watch')
  const mineItems = mineFile.data
  const otherItems = otherFile.data
  const viewItems = (viewId === mineId ? mineItems : otherItems) ?? NO_ITEMS
  const filesLoading = mineItems === undefined || otherItems === undefined

  const productIds = useMemo(() => [...(mineItems ?? []), ...(otherItems ?? [])].map((i) => i.productId), [mineItems, otherItems])
  const historyIds = useMemo(() => viewItems.filter(isHeld).map((i) => i.productId), [viewItems])
  const catalog = useVaultCatalog(productIds, historyIds)
  const setMap = useSetMap()

  const toRows = useCallback(
    (items: VaultItem[]): VaultRow[] =>
      items.map((item) => {
        const product = catalog.products.get(item.productId)
        return { item, product, set: product ? setMap?.get(product.set) : undefined, valued: valueItem(item, quoteFor(product, item.variant)) }
      }),
    [catalog.products, setMap],
  )
  const allRows = useMemo(() => toRows(viewItems), [toRows, viewItems])
  const myRows = useMemo(() => (viewId === mineId ? allRows : toRows(mineItems ?? [])), [viewId, mineId, allRows, toRows, mineItems])

  // ----- filters scope everything below -----
  const options = useMemo(() => filterOptions(allRows), [allRows])
  const rows = useMemo(() => applyFilters(allRows, filters), [allRows, filters])
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t, rows.filter((r) => r.item.status === t).length])) as Record<VaultStatus, number>, [rows])
  const tabRows = useMemo(() => sortRows(rows.filter((r) => r.item.status === tab), filters.sort), [rows, tab, filters.sort])
  const heldRows = useMemo(() => rows.filter((r) => isHeld(r.item)), [rows])

  const summary = useMemo(() => summarize(rows.map((r) => r.valued)), [rows])
  const series = useMemo(() => {
    const holdings: Holding[] = []
    for (const r of heldRows) {
      if (!r.product || !r.valued.quote) continue
      holdings.push({ key: `${r.item.productId}:${r.valued.quote.variant}`, setId: r.product.set, qty: r.item.qty, fallback: r.valued.market })
    }
    return valueSeries(holdings, catalog.histories as Map<number, SetHistory>)
  }, [heldRows, catalog.histories])
  const month = useMemo(() => periodChange(heldRows, '30d'), [heldRows])
  const bySet = useMemo(() => breakdown(rows, 'set', 6, setLabel), [rows])
  const byRarity = useMemo(() => breakdown(rows, 'rarity', 6), [rows])
  const moversByWindow = useMemo(() => ({ added: movers(heldRows, 'added'), '7d': movers(heldRows, '7d'), '30d': movers(heldRows, '30d') }), [heldRows])

  // Set completion ignores the rarity, price and gain filters: progress toward a set is absolute.
  const progress = useMemo(() => {
    const scope = applyFilters(allRows, { ...filters, rarity: null, price: null, gain: null })
    const owned = ownedBySet(scope.filter((r) => isHeld(r.item) && r.product?.kind === 'card' && r.set).map((r) => ({ productId: r.item.productId, set: (r.product as { set: number }).set })))
    const list = [...owned].flatMap(([setId, ids]) => {
      const set = setMap?.get(setId)
      const products = catalog.setProducts.get(setId)
      return set && products ? [setProgress(set, products, ids)] : []
    })
    return sortProgress(list)
  }, [allRows, filters, setMap, catalog.setProducts])

  // Tangible units: real sealed products at MSRP.
  const { data: sealedRows } = useSealed()
  const { data: msrp } = useData<{ byType: Record<string, { msrp: number | null }> }>('seed/msrp.json')
  const units = useMemo(() => (sealedRows && msrp && setMap ? buildUnits(sealedRows, (id) => setLabel(setMap.get(id)), msrp.byType, today()) : []), [sealedRows, msrp, setMap])

  // ----- trade matches (your vault against theirs, never filtered) -----
  const matches = useMemo(() => (mineId !== otherId && mineItems && otherItems ? tradeMatches(mineItems, otherItems) : { theyHave: [], iHave: [], bothWant: [] }), [mineId, otherId, mineItems, otherItems])
  const info = useCallback(
    (id: number) => {
      const p = catalog.products.get(id)
      return p ? { name: p.name, market: quoteFor(p)?.market ?? null, kind: p.kind } : undefined
    },
    [catalog.products],
  )

  // ----- writes -----
  /** Commits a change to your vault. `ok` is the success toast; null stays quiet (the caller has its own moment). */
  const write = useCallback(
    async (mutate: (items: VaultItem[]) => VaultItem[], message: string, ok: string | null): Promise<boolean> => {
      if (ok) return withToast(() => updateUserFile<VaultItem>(`vault-${mineId}`, mutate, message), ok)
      try {
        await updateUserFile<VaultItem>(`vault-${mineId}`, mutate, message)
        return true
      } catch (err) {
        toast((err as Error).message, 'error')
        return false
      }
    },
    [mineId],
  )
  const [burst, setBurst] = useState(0)
  const celebrate = (message: string) => {
    setBurst((b) => b + 1)
    toast(message)
  }

  const [picking, setPicking] = useState(false)
  const [addId, setAddId] = useState<number | null>(null)
  const [editing, setEditing] = useState<{ item: VaultItem; gotIt: boolean } | null>(null)
  const [selling, setSelling] = useState<VaultItem | null>(null)
  const [focusWant, setFocusWant] = useState<string | null>(null)
  const clearFocus = useCallback(() => setFocusWant(null), [])

  const rowFor = (item: VaultItem | null) => (item ? allRows.find((r) => r.item.id === item.id) : undefined)
  const actions: RowActions = {
    onEdit: (r) => setEditing({ item: r.item, gotIt: false }),
    onMove: (r, status) => void write((items) => updateItem(items, r.item.id, { status }), `Vault: ${itemName(r)} to ${status}`, status === 'trade' ? 'Flagged for trade' : 'Moved back to have'),
    onSold: (r) => setSelling(r.item),
    onRemove: (r) => void write((items) => removeItem(items, r.item.id), `Vault: remove ${itemName(r)}`, 'Removed'),
    onGotIt: (r) => setEditing({ item: { ...r.item, status: 'have' }, gotIt: true }),
    onFund: (r) => setFocusWant(r.item.id),
  }

  // A set going from incomplete to complete is worth a moment.
  const completed = useRef<Set<number> | null>(null)
  useEffect(() => {
    if (!progress.length || catalog.loading) return
    const now = new Set(progress.filter((p) => p.complete).map((p) => p.set.id))
    if (completed.current && editable) {
      const fresh = progress.filter((p) => p.complete && !completed.current?.has(p.set.id))
      if (fresh.length) {
        setBurst((b) => b + 1)
        toast(`Set complete: ${setLabel(fresh[0].set)}. Nice.`)
      }
    }
    completed.current = now
  }, [progress, catalog.loading, editable])

  const watchFor = useCallback((productId: number) => watchFile.data?.find((w) => w.by === viewId && w.productId === productId), [watchFile.data, viewId])
  const person = people.find((p) => p.id === viewId)
  const otherName = personName(people, otherId)
  const loading = filesLoading || (viewItems.length > 0 && catalog.loading)

  const exportCsv = () => {
    const name = person?.name ?? 'vault'
    download(vaultCsvFilename(name), vaultCsv(allRows, name))
  }

  const empty = !loading && viewItems.length === 0
  const historyStart = series.dates[0]

  return (
    <div>
      <Confetti burst={burst} />
      <PageHeader
        title="Vault"
        sub={editable ? 'Your library: what it is worth, what to hunt, what to flip.' : `${person?.name ?? 'Their'}'s library. You can look but not change it.`}
        action={
          editable ? (
            <div className="flex gap-2">
              <Button aria-label="Scan cards from a photo" data-slot="scan-cards" onClick={() => navigate('/scan')}>
                <ScanLine size={16} aria-hidden /> <span className="hidden sm:inline">Scan</span>
              </Button>
              <Button variant="primary" onClick={() => setPicking(true)}>
                <Plus size={16} aria-hidden /> Add
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          className="[&>button]:min-h-11"
          options={people.map((p) => ({
            value: p.id,
            label: (
              <span className="inline-flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-black" style={{ background: p.color }}>
                  {p.name.slice(0, 1)}
                </span>
                {p.id === mineId ? `${p.name} (you)` : p.name}
              </span>
            ),
          }))}
          value={viewId}
          onChange={(v) => setParams({ who: v === mineId ? null : v })}
        />
        {!empty && (
          <Button variant="ghost" onClick={exportCsv}>
            <Download size={14} aria-hidden /> Export CSV
          </Button>
        )}
      </div>

      {editable && !canWrite && (
        <div className="mb-4">
          <KeyPrompt />
        </div>
      )}

      {mineId !== otherId && (matches.theyHave.length > 0 || matches.iHave.length > 0 || matches.bothWant.length > 0) && (
        <div className="mb-6">
          <TradeMatchesCard matches={matches} other={otherName} info={info} />
        </div>
      )}

      {loading && !viewItems.length ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-40" />
        </div>
      ) : empty ? (
        <Empty
          icon={<Gem size={20} />}
          title={editable ? 'Your vault is empty' : `${person?.name}'s vault is empty`}
          action={
            editable ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={() => navigate('/scan')}>
                  <ScanLine size={16} aria-hidden /> Scan a pile or binder page
                </Button>
                <Button onClick={() => setPicking(true)}>
                  <Plus size={16} aria-hidden /> Add one by search
                </Button>
              </div>
            ) : undefined
          }
        >
          {editable ? 'Track what you own, what you want and what you have for trade. Everything gets a live market value.' : 'Nothing here yet.'}
        </Empty>
      ) : (
        <>
          <div className="mb-5">
            <FilterRow filters={filters} options={options} onChange={setFilters} />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
              <Summary name={person?.name ?? 'Your'} summary={summary} series={series} units={units} month={month} filtered={isFiltered(filters)} empty={!rows.length} />

              <div className="flex items-center justify-between gap-3">
                <div className="no-scrollbar -mx-4 min-w-0 flex-1 overflow-x-auto px-4">
                  <Segmented
                    className="[&>button]:min-h-11"
                    options={TABS.map((t) => ({
                      value: t,
                      label: (
                        <span>
                          {TAB_LABEL[t]} <span className="text-ink-3 tabular">{counts[t]}</span>
                        </span>
                      ),
                    }))}
                    value={tab}
                    onChange={(t) => setParams({ tab: t === 'have' ? null : t })}
                  />
                </div>
                <Segmented
                  className="[&>button]:min-h-11"
                  options={[
                    { value: 'list', label: <LayoutList size={15} aria-label="List view" /> },
                    { value: 'binder', label: <BookOpen size={15} aria-label="Binder view" /> },
                  ]}
                  value={view}
                  onChange={(v) => setParams({ view: v === 'list' ? null : v })}
                />
              </div>

              {tabRows.length === 0 ? (
                <Empty title={isFiltered(filters) && allRows.some((r) => r.item.status === tab) ? 'Nothing matches these filters' : `Nothing in ${TAB_LABEL[tab]} yet`} action={isFiltered(filters) ? <Button onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}>Reset filters</Button> : editable ? <Button onClick={() => setPicking(true)}>Add one</Button> : undefined}>
                  {isFiltered(filters) ? 'Try loosening a filter.' : EMPTY_COPY[tab]}
                </Empty>
              ) : view === 'binder' ? (
                <Binder rows={tabRows} tab={tab} />
              ) : (
                <ItemList rows={tabRows} tab={tab} actions={actions} editable={editable} watchFor={watchFor} />
              )}
            </div>

            <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
              <Movers byWindow={moversByWindow} historyStart={historyStart} />
              <SetCompletion progress={progress} />
              <ValueBreakdown bySet={bySet} byRarity={byRarity} />
              {editable && <FlipToFund held={myRows.filter((r) => isHeld(r.item))} wants={myRows.filter((r) => r.item.status === 'want')} focusWantId={focusWant} onFocused={clearFocus} />}
            </aside>
          </div>
        </>
      )}

      <ProductPickerSheet open={picking} onClose={() => setPicking(false)} onPick={(row) => setAddId(row[0])} title="Add to your vault" />
      <AddSheet
        productId={addId}
        defaultStatus={tab === 'want' ? 'want' : tab === 'trade' ? 'trade' : 'have'}
        onClose={() => setAddId(null)}
        onSave={(item, name) => write((items) => addItem(items, { ...item, id: newId(), added: today() }), `Vault: add ${name}`, 'Added to your vault')}
      />
      <EditSheet
        item={editing?.item ?? null}
        name={rowFor(editing?.item ?? null) ? itemName(rowFor(editing?.item ?? null) as VaultRow) : ''}
        variants={Object.keys(rowFor(editing?.item ?? null)?.product?.v ?? {})}
        sealed={rowFor(editing?.item ?? null)?.product?.kind === 'sealed'}
        onClose={() => setEditing(null)}
        onSave={async (id: string, patch: ItemPatch) => {
          const gotIt = editing?.gotIt && patch.status === 'have'
          const name = itemName(rowFor(editing?.item ?? null) as VaultRow)
          const ok = await write((items) => updateItem(items, id, patch), `Vault: update ${name}`, gotIt ? null : 'Saved')
          if (ok && gotIt) celebrate(`Got it! ${name} is in your vault.`)
          return ok
        }}
      />
      <SoldSheet
        item={selling}
        name={selling ? itemName(rowFor(selling) as VaultRow) : ''}
        market={rowFor(selling)?.valued.market ?? null}
        onClose={() => setSelling(null)}
        onSave={(id, qty, price) => write((items) => splitLot(items, id, qty, price, newId()), `Vault: mark sold`, 'Marked as sold')}
      />
    </div>
  )
}
