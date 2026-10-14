// A set: cards (sortable, filterable), sealed (with MSRP math) and the top chase cards.
import { ArrowDown, ArrowUp, ChevronLeft, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ProductThumb, setLabel } from '../../components/product.tsx'
import { PriceChart } from '../../components/PriceChart.tsx'
import { Badge, Button, Card, Chips, Delta, Empty, Input, Money, Select, Skeleton, Stat, cx } from '../../components/ui.tsx'
import { headline, useData, useSetHistory, useSetProducts, useSets } from '../../lib/data.ts'
import { money, num, relDays, shortDate } from '../../lib/format.ts'
import { displayName, leadPrice, msrpFor, perPack, rarityRank, ratioLabel, releaseKnown, SEALED_LABEL, setValueSeries, sortProducts, topCardKeys, type MsrpSeed, type ProductSortKey } from '../../lib/market.ts'
import { todayIso, useHistoryStatus, useIsWide } from '../../lib/market-hooks.ts'
import { boxesLabel, shareOfValue, unitsFromSeed, type PackUnits } from '../../lib/market-pulls.ts'
import type { SetSummary, SiteProduct } from '../../lib/site.ts'
import { CountUp, ShimmerStyles, Tabs, useChartRange } from './parts.tsx'

type Tab = 'cards' | 'sealed' | 'chase'
interface Sort {
  key: ProductSortKey
  dir: 'asc' | 'desc'
}

const PAGE = 100

function Back() {
  return (
    <Link to="/market?tab=sets" className="mb-3 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
      <ChevronLeft size={16} aria-hidden /> Sets
    </Link>
  )
}

function NotFound() {
  return (
    <div>
      <Back />
      <Empty title="We couldn't find that set" action={<Button onClick={() => history.back()}>Go back</Button>}>
        It may have been renamed or removed from TCGplayer. Browse all sets from the Market page.
      </Empty>
    </div>
  )
}

/** Name, number, rarity and price of one card for the phone list. */
function CardRow({ p, setCode }: { p: SiteProduct; setCode: string }) {
  const h = headline(p)
  const rarity = p.rarity && p.rarity !== 'None' ? p.rarity : undefined
  return (
    <Link to={`/item/${p.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2">
      <ProductThumb id={p.id} kind="card" size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{displayName(p.name)}</div>
        <div className="mt-0.5 truncate text-[12px] text-ink-3">
          <span className="tabular">{p.num ? p.num : setCode}</span>
          {rarity && <span> · {rarity}</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {leadPrice(p) == null ? (
          <div className="text-[12px] text-ink-3">No price yet</div>
        ) : (
          <>
            <div className="text-[14px] font-semibold">
              <Money value={leadPrice(p)} />
            </div>
            <Delta value={h?.[1][3]} className="text-[12px]" />
          </>
        )}
      </div>
    </Link>
  )
}

const COLUMNS: Array<{ key: ProductSortKey; label: string; align: 'left' | 'right'; width?: string }> = [
  { key: 'name', label: 'Card', align: 'left' },
  { key: 'num', label: 'No.', align: 'left', width: 'w-24' },
  { key: 'rarity', label: 'Rarity', align: 'left', width: 'w-44' },
  { key: 'price', label: 'Market', align: 'right', width: 'w-24' },
  { key: 'low', label: 'Low', align: 'right', width: 'w-24' },
  { key: 'c7', label: '7d', align: 'right', width: 'w-20' },
  { key: 'c30', label: '30d', align: 'right', width: 'w-20' },
]

function CardTable({ rows, sort, onSort }: { rows: SiteProduct[]; sort: Sort; onSort: (key: ProductSortKey) => void }) {
  const navigate = useNavigate()
  return (
    <div className="rounded-2xl border border-line bg-surface shadow-card">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-ink-3">
            <th className="sticky top-[53px] z-10 w-12 rounded-tl-2xl border-b border-line bg-surface lg:top-0" />
            {COLUMNS.map((c, i) => (
              <th
                key={c.key}
                aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                className={cx('sticky top-[53px] z-10 border-b border-line bg-surface px-2 font-medium lg:top-0', c.align === 'right' ? 'text-right' : 'text-left', c.width, i === COLUMNS.length - 1 && 'rounded-tr-2xl pr-4')}
              >
                <button type="button" onClick={() => onSort(c.key)} className={cx('inline-flex min-h-11 items-center gap-1 hover:text-ink', sort.key === c.key && 'text-ink', c.align === 'right' && 'flex-row-reverse')}>
                  {c.label}
                  {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const h = headline(p)
            const rarity = p.rarity && p.rarity !== 'None' ? p.rarity : ''
            return (
              <tr key={p.id} onClick={() => navigate(`/item/${p.id}`)} className="cursor-pointer border-b border-line transition last:border-0 hover:bg-surface-2">
                <td className="px-2 py-1.5">
                  <ProductThumb id={p.id} kind="card" size="sm" className="w-8" />
                </td>
                <td className="max-w-0 px-2 py-1.5">
                  <Link to={`/item/${p.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:underline">
                    {displayName(p.name)}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-ink-2 tabular">{p.num ?? ''}</td>
                <td className="truncate px-2 py-1.5 text-ink-2">{rarity}</td>
                <td className="px-2 py-1.5 text-right font-semibold">
                  <Money value={leadPrice(p)} />
                </td>
                <td className="px-2 py-1.5 text-right text-ink-2">
                  <Money value={h?.[1][1]} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Delta value={h?.[1][3]} className="text-[12px]" />
                </td>
                <td className="px-2 py-1.5 pr-4 text-right">
                  <Delta value={h?.[1][4]} className="text-[12px]" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const SORT_OPTIONS: Array<{ value: string; label: string; sort: Sort }> = [
  { value: 'num:asc', label: 'Card number', sort: { key: 'num', dir: 'asc' } },
  { value: 'price:desc', label: 'Price: high to low', sort: { key: 'price', dir: 'desc' } },
  { value: 'price:asc', label: 'Price: low to high', sort: { key: 'price', dir: 'asc' } },
  { value: 'rarity:desc', label: 'Rarest first', sort: { key: 'rarity', dir: 'desc' } },
  { value: 'name:asc', label: 'Name A to Z', sort: { key: 'name', dir: 'asc' } },
  { value: 'c7:desc', label: '7-day change', sort: { key: 'c7', dir: 'desc' } },
]

function CardsTab({ products, code }: { products: SiteProduct[]; code: string }) {
  const wide = useIsWide(768)
  const status = useHistoryStatus()
  const [sort, setSort] = useState<Sort>({ key: 'num', dir: 'asc' })
  const [rarity, setRarity] = useState('all')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)
  const cards = useMemo(() => products.filter((p) => p.kind === 'card'), [products])
  const rarities = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of cards) if (p.rarity && p.rarity !== 'None') counts.set(p.rarity, (counts.get(p.rarity) ?? 0) + 1)
    return [...counts].sort((a, b) => rarityRank(b[0]) - rarityRank(a[0]) || b[1] - a[1])
  }, [cards])
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = cards.filter((p) => (rarity === 'all' || p.rarity === rarity) && (!q || p.name.toLowerCase().includes(q) || (p.num ?? '').toLowerCase().includes(q)))
    return sortProducts(filtered, sort.key, sort.dir)
  }, [cards, rarity, query, sort])

  const onSort = (key: ProductSortKey) => {
    setShown(PAGE)
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'num' ? 'asc' : 'desc' }))
  }

  if (!cards.length) {
    return (
      <Empty title="No cards listed yet">
        {products.length ? 'TCGplayer only has sealed products for this set so far. Singles show up after the set is released.' : 'There are no products in this set.'}
      </Empty>
    )
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:flex sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setShown(PAGE)
            }}
            placeholder="Filter by name or number"
            aria-label="Filter cards in this set"
            className="pl-9"
          />
        </div>
        {!wide && (
          <Select
            aria-label="Sort cards"
            value={`${sort.key}:${sort.dir}`}
            onChange={(e) => {
              setSort(SORT_OPTIONS.find((o) => o.value === e.target.value)!.sort)
              setShown(PAGE)
            }}
            className="sm:w-52"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} disabled={o.sort.key === 'c7' && !status?.ready[7]}>
                {o.label}
                {o.sort.key === 'c7' && !status?.ready[7] && status?.appears[7] ? ` (from ${shortDate(status.appears[7])})` : ''}
              </option>
            ))}
          </Select>
        )}
      </div>
      {rarities.length > 1 && (
        <div className="mb-3">
          <Chips
            value={rarity}
            onChange={(v) => {
              setRarity(v)
              setShown(PAGE)
            }}
            options={[{ value: 'all', label: 'All', count: cards.length }, ...rarities.map(([r, n]) => ({ value: r, label: r, count: n }))]}
          />
        </div>
      )}
      {!rows.length ? (
        <p className="py-8 text-center text-sm text-ink-3">No cards match. Clear the filter or pick another rarity.</p>
      ) : (
        <>
          <p className="mb-2 text-[13px] text-ink-3">
            {num(rows.length)} {rows.length === 1 ? 'card' : 'cards'}
          </p>
          {wide ? (
            <CardTable rows={rows.slice(0, shown)} sort={sort} onSort={onSort} />
          ) : (
            <Card className="divide-y divide-line p-1.5">
              {rows.slice(0, shown).map((p) => (
                <CardRow key={p.id} p={p} setCode={code} />
              ))}
            </Card>
          )}
          {rows.length > shown && (
            <div className="mt-3 text-center">
              <Button onClick={() => setShown(shown + PAGE)}>Show more ({rows.length - shown} left)</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SealedTab({ products, seed }: { products: SiteProduct[]; seed: MsrpSeed | undefined }) {
  const sealed = useMemo(
    () =>
      products
        .filter((p) => p.kind === 'sealed')
        .sort((a, b) => (leadPrice(b) ?? -1) - (leadPrice(a) ?? -1)),
    [products],
  )
  if (!sealed.length) return <Empty title="No sealed products in this set">Sealed boxes, ETBs and bundles show up here when TCGplayer lists them.</Empty>
  return (
    <Card className="divide-y divide-line p-1.5">
      {sealed.map((p) => {
        const market = leadPrice(p)
        const m = msrpFor({ id: p.id, name: p.name, sealed: p.sealed, msrp: p.msrp }, seed)
        const pp = perPack(market, p.packs)
        return (
          <div key={p.id} className="px-2 py-2.5">
            <div className="flex items-start gap-3">
              <Link to={`/item/${p.id}`} className="flex min-w-0 flex-1 items-start gap-3">
                <ProductThumb id={p.id} kind="sealed" size="sm" />
                <div className="min-w-0">
                  <div className="line-clamp-2 text-[14px] leading-snug font-medium">{p.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
                    {p.sealed && <span>{SEALED_LABEL[p.sealed]}</span>}
                    {p.presale && (
                      <Badge tone="accent" className="!py-0 !text-[10.5px]">
                        Presale
                      </Badge>
                    )}
                  </div>
                </div>
              </Link>
              <div className="shrink-0 text-right">
                <div className="text-[15px] font-semibold">
                  <Money value={market} />
                </div>
                {m && market ? (
                  <div className="text-[12px] text-ink-3 tabular">
                    MSRP {money(m.msrp)}
                    {(m.conf === 'med' || m.conf === 'low') && ' est.'} · <span className={cx('font-semibold', market / m.msrp >= 1.05 ? 'text-up' : 'text-ink-2')}>{ratioLabel(market / m.msrp)}</span>
                  </div>
                ) : (
                  <div className="text-[12px] text-ink-3">No MSRP on file</div>
                )}
                {pp != null && <div className="text-[12px] text-ink-3 tabular">{money(pp)}/pack</div>}
              </div>
            </div>
            {market != null && p.sealed && ['booster-box', 'etb', 'pc-etb', 'bundle', 'upc', 'premium-collection', 'tin', 'collection', 'build-battle', 'half-box'].includes(p.sealed) && (
              <Link to={`/tools?tab=ev&product=${p.id}`} className="mt-1.5 ml-[3.25rem] inline-flex min-h-8 items-center text-[12.5px] font-medium text-accent hover:underline">
                Open vs keep sealed
              </Link>
            )}
          </div>
        )
      })}
    </Card>
  )
}

function ChaseTab({ products, setId, withValue }: { products: SiteProduct[]; setId: number; withValue: boolean }) {
  const top = useMemo(
    () =>
      products
        .filter((p) => p.kind === 'card' && leadPrice(p) != null)
        .sort((a, b) => (leadPrice(b) ?? 0) - (leadPrice(a) ?? 0))
        .slice(0, 10),
    [products],
  )
  if (!top.length) return <Empty title="No chase cards yet">Once cards in this set have prices, the ten most valuable show here.</Empty>
  return (
    <div>
      <ShimmerStyles />
      <ValueShare products={products} />
      {withValue && <SetValue setId={setId} products={products} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {top.map((p, i) => {
        const h = headline(p)
        return (
          <Card key={p.id} to={`/item/${p.id}`} holo={i === 0} className="overflow-hidden p-2.5">
            <div className={cx('relative rounded-lg', i < 3 && 'mm-shimmer')}>
              <ProductThumb id={p.id} kind="card" size="lg" className="rounded-lg" />
              <span className="absolute top-1.5 left-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/70 px-1.5 text-[12px] font-bold text-white tabular">{i + 1}</span>
            </div>
            <div className="mt-2 truncate text-[13px] font-medium">{displayName(p.name)}</div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-semibold tabular">{money(leadPrice(p))}</span>
              {h?.[1][3] != null && <Delta value={h[1][3]} className="text-[11.5px]" />}
            </div>
            <div className="truncate text-[11.5px] text-ink-3">{[p.num?.split('/')[0], p.rarity && p.rarity !== 'None' ? p.rarity : ''].filter(Boolean).join(' · ')}</div>
          </Card>
        )
      })}
      </div>
    </div>
  )
}

/** Where the set's value sits: how much the top card, the next two and the top ten hold. */
function ValueShare({ products }: { products: SiteProduct[] }) {
  const prices = useMemo(() => products.filter((p) => p.kind === 'card').map((p) => leadPrice(p) ?? 0).filter((v) => v > 0), [products])
  if (prices.length < 12) return null
  const s1 = shareOfValue(prices, 1)
  const s3 = shareOfValue(prices, 3)
  const s10 = shareOfValue(prices, 10)
  const parts = [
    { label: 'Top card', pct: s1, cls: 'bg-accent' },
    { label: 'Next 2', pct: s3 - s1, cls: 'bg-[color-mix(in_srgb,var(--accent)_65%,transparent)]' },
    { label: 'Next 7', pct: s10 - s3, cls: 'bg-[color-mix(in_srgb,var(--accent)_35%,transparent)]' },
    { label: `Other ${num(prices.length - 10)}`, pct: 1 - s10, cls: 'bg-surface-3' },
  ]
  return (
    <Card className="mb-5 p-4">
      <div className="text-[13px] font-medium text-ink-2">Where the value sits</div>
      <p className="mt-0.5 text-[13px] text-ink-3">
        The top card is {Math.round(s1 * 100)}% of this set's value; the top 10 hold {Math.round(s10 * 100)}%. {s10 > 0.7 ? 'Top-heavy: a few chase cards carry it.' : s10 < 0.4 ? 'Spread out: the bulk is worth something too.' : 'A fairly even spread.'}
      </p>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={parts.map((x) => `${x.label} ${Math.round(x.pct * 100)}%`).join(', ')}>
        {parts.map((x) => (
          <div key={x.label} className={x.cls} style={{ width: `${x.pct * 100}%` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
        {parts.map((x) => (
          <span key={x.label} className="inline-flex items-center gap-1.5">
            <span className={cx('inline-block h-2 w-2 rounded-full', x.cls)} aria-hidden />
            {x.label} <span className="tabular text-ink-2">{Math.round(x.pct * 100)}%</span>
          </span>
        ))}
      </div>
    </Card>
  )
}

function SetValue({ setId, products }: { setId: number; products: SiteProduct[] }) {
  const { data: history } = useSetHistory(setId)
  const status = useHistoryStatus()
  const keys = useMemo(() => topCardKeys(products, 20), [products])
  const values = useMemo(() => (history ? setValueSeries(history, keys) : []), [history, keys])
  const dates = history?.dates ?? []
  const { start, control } = useChartRange(dates)
  if (!history || !keys.length) return null
  const points = values.filter((v) => v != null).length
  if (dates.length < 2 || points < 2) {
    return (
      <Card className="mb-5 p-4">
        <div className="text-[13px] font-medium text-ink-2">Set value over time</div>
        <p className="mt-1 text-[13px] text-ink-3">
          The line is the combined price of this set's top {keys.length} cards, and needs two days of prices to draw.{' '}
          {status?.first && `History started ${shortDate(status.first)}; the first line segment appears ${shortDate(status.appears[1]!)}.`}
        </p>
      </Card>
    )
  }
  const last = values[values.length - 1]
  const first = values.slice(start).find((v) => v != null) ?? null
  const change = last != null && first ? last / first - 1 : null
  return (
    <Card className="mb-5 p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] text-ink-3">Top {keys.length} cards combined</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-semibold tabular">{money(last)}</span>
            <Delta value={change} className="text-[13px]" />
          </div>
        </div>
        {control}
      </div>
      <PriceChart dates={dates.slice(start)} series={[{ key: 'value', label: `Top ${keys.length} cards`, color: 'var(--series-market)', values: values.slice(start) }]} height={190} />
    </Card>
  )
}

export default function SetPage() {
  const params = useParams()
  const setId = Number(params.id)
  const { data: sets, loading } = useSets()
  const status = useHistoryStatus()
  const set: SetSummary | undefined = sets?.find((s) => s.id === setId)
  const { data: products, loading: productsLoading } = useSetProducts(set ? setId : null)
  const seed = useData<MsrpSeed>('seed/msrp.json')
  const [tab, setTab] = useState<Tab>('cards')
  const units: PackUnits = unitsFromSeed(seed.data)
  const hasHistory = (status?.count ?? 0) >= 2

  if (loading || !sets) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (!set) return <NotFound />

  const dated = releaseKnown(set, status?.first)
  const upcoming = dated && set.released > todayIso()
  const topCard = set.chase[0]

  return (
    <div>
      <Back />
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{setLabel(set)}</h1>
          {set.abbr && <Badge>{set.abbr}</Badge>}
          <Badge>{set.lang === 'EN' ? 'English' : 'Japanese'}</Badge>
          {upcoming && <Badge tone="accent">Upcoming</Badge>}
        </div>
        <p className="mt-1 text-sm text-ink-2">
          {dated ? (upcoming ? `Releases ${shortDate(set.released)} (${relDays(set.released)})` : `Released ${shortDate(set.released)}`) : 'Release date not listed by TCGplayer'}
          {set.supplemental && ' · promo or extra group'}
        </p>
      </div>

      <Card className="mb-5 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <Stat label="Cards" value={num(set.cards)} />
        <Stat
          label="Master set (est.)"
          value={<CountUp value={set.value > 0 ? set.value : null} format={(n) => money(n, { compact: true })} />}
          sub={set.value > 0 && set.lang === 'EN' ? `≈ ${boxesLabel(set.value, units)} at retail` : "Every card's top price, summed"}
        />
        <Stat label="Sealed products" value={num(set.sealedCount)} />
        <Stat label="Top card" value={topCard ? money(topCard[2], { compact: true }) : '—'} sub={topCard ? <span className="block truncate">{topCard[1].split(' - ')[0]}</span> : undefined} />
      </Card>

      {products && hasHistory && <SetValue setId={setId} products={products} />}

      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'cards', label: 'Cards', count: set.cards },
          { value: 'sealed', label: 'Sealed', count: set.sealedCount },
          { value: 'chase', label: 'Chase' },
        ]}
      />
      {productsLoading || !products ? (
        <Skeleton className="h-64" />
      ) : (
        <div role="tabpanel" className="fade-in" key={tab}>
          {tab === 'cards' && <CardsTab products={products} code={set.abbr} />}
          {tab === 'sealed' && <SealedTab products={products} seed={seed.data} />}
          {tab === 'chase' && <ChaseTab products={products} setId={setId} withValue={!hasHistory} />}
        </div>
      )}
    </div>
  )
}
