// One card or sealed product: price, history, what it's worth in things you know, and the
// actions (watch, vault, check a deal). Built phone-first: image and price up top, actions pinned
// to the thumb.
import { Calculator, Check, ChevronLeft, Eye, Gem, Search, Tag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { PriceChart, type ChartSeries } from '../../components/PriceChart.tsx'
import { ProductThumb, setLabel } from '../../components/product.tsx'
import { Badge, Button, Card, Delta, Empty, Sheet, Skeleton, cx } from '../../components/ui.tsx'
import { variantLabel, productImage } from '../../lib/classify.ts'
import { useData, useProduct, useSetHistory, useSetProducts, useSets } from '../../lib/data.ts'
import { money, relDays, shortDate } from '../../lib/format.ts'
import { displayName, findWatch, flipAtLow, lowCallout, pickVariant, WINDOWS, variantOrder, type MsrpSeed, type Window } from '../../lib/market.ts'
import { todayIso, useHistoryStatus } from '../../lib/market-hooks.ts'
import { asMsrpUnits, unitsFromSeed } from '../../lib/market-pulls.ts'
import { toast } from '../../components/toast.tsx'
import { useMe, usePeople } from '../../lib/people.ts'
import type { SiteProduct } from '../../lib/site.ts'
import type { VaultItem, WatchItem } from '../../lib/user.ts'
import { useUserFile } from '../../lib/userData.ts'
import { VaultSheet, WatchSheet } from './ItemSheets.tsx'
import { EuPanel, FriendsStatus, OtherPrintings, PullPanel, ResearchLinks, SealedPanel } from './ItemPanels.tsx'
import { CountUp, ShimmerStyles, useChartRange } from './parts.tsx'

const VARIANT_COLORS = ['var(--series-market)', 'var(--series-low)', 'var(--series-3)']

function NotFound() {
  return (
    <div>
      <Link to="/market" className="mb-3 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
        <ChevronLeft size={16} aria-hidden /> Market
      </Link>
      <Empty
        icon={<Search size={20} />}
        title="We couldn't find that item"
        action={
          <Button variant="primary" onClick={() => (location.hash = '#/market')}>
            Search the market
          </Button>
        }
      >
        The link may be old, or the product was removed from TCGplayer. Search by name or set to find it.
      </Empty>
    </div>
  )
}

function ChangeCell({ days, value }: { days: Window; value: number | null | undefined }) {
  const status = useHistoryStatus()
  const ready = status?.ready[days]
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="text-[12px] text-ink-3">{days} {days === 1 ? 'day' : 'days'}</div>
      <div className="mt-0.5 text-[17px] font-semibold">
        <Delta value={value} digits={1} />
      </div>
      {value == null && <div className="text-[11.5px] text-ink-3">{ready ? 'no price then' : status?.appears[days] ? `from ${shortDate(status.appears[days]!)}` : ''}</div>}
    </div>
  )
}

function HistoryPanel({ product, variant, market, euHint }: { product: SiteProduct; variant: string | undefined; market: number | null; euHint: boolean }) {
  const { data: history } = useSetHistory(product.set)
  const status = useHistoryStatus()
  const [all, setAll] = useState(false)
  const dates = history?.dates ?? []
  const { start, control } = useChartRange(dates)
  const codes = variantOrder(Object.keys(product.v))
  const series: ChartSeries[] = useMemo(() => {
    if (!history || !variant) return []
    const use = all ? codes : [variant]
    return use.map((c, i) => ({ key: c, label: variantLabel(c), color: VARIANT_COLORS[i % VARIANT_COLORS.length], values: (history.series[`${product.id}:${c}`] ?? []).slice(start) }))
  }, [history, variant, all, codes, product.id, start])

  if (!history) return <Skeleton className="h-52" />
  const enough = series.some((s) => s.values.filter((v) => v != null).length >= 2)
  if (!enough) {
    return (
      <Card className="p-4">
        <h3 className="text-[15px] font-semibold">Price history</h3>
        <div className="my-4 flex items-center gap-3" aria-hidden>
          <div className="h-px flex-1 border-t border-dashed border-line-strong" />
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[13px] font-semibold tabular">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
            {money(market)}
          </div>
        </div>
        <p className="text-[13px] text-ink-2">
          {status?.first ? `Tracking started ${shortDate(status.first)}, so there is one day of prices.` : 'No history yet.'} The line draws once there are two days
          {status?.appears[1] ? `, after the nightly pull on ${shortDate(status.appears[1])}` : ''}. {euHint ? ' Meanwhile, a European trend shows below when we can match this card on Cardmarket.' : ''}
        </p>
      </Card>
    )
  }
  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">Market price</h3>
        <div className="flex items-center gap-2">
          {codes.length > 1 && (
            <button
              type="button"
              aria-pressed={all}
              onClick={() => setAll(!all)}
              className={cx('min-h-8 rounded-full border px-3 text-[12px] font-medium transition', all ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-3 hover:text-ink')}
            >
              All variants
            </button>
          )}
          {control}
        </div>
      </div>
      <PriceChart dates={dates.slice(start)} series={series} height={210} />
      <p className="mt-1 text-[12px] text-ink-3">TCGplayer market price per day, from {shortDate(dates[0])}.</p>
    </Card>
  )
}

function ImageZoom({ product, open, onClose }: { product: SiteProduct; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={displayName(product.name)}>
      <img src={productImage(product.id, 400)} alt={displayName(product.name)} className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-xl" />
    </Sheet>
  )
}

export default function ItemPage() {
  const params = useParams()
  const productId = Number(params.id)
  const [search, setSearch] = useSearchParams()
  const { data: product, loading } = useProduct(Number.isFinite(productId) && productId > 0 ? productId : null)
  const { data: sets } = useSets()
  const { data: setProducts } = useSetProducts(product?.set ?? null)
  const seed = useData<MsrpSeed>('seed/msrp.json')
  const people = usePeople()
  const me = useMe()
  const { data: watch } = useUserFile<WatchItem>('watch')
  const { data: myVault } = useUserFile<VaultItem>(me ? `vault-${me.id}` : 'vault-none')
  const [watchOpen, setWatchOpen] = useState(false)
  const [vaultOpen, setVaultOpen] = useState(false)
  const [zoom, setZoom] = useState(false)

  if (loading || (!product && !sets)) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-6 w-24" />
        <div className="grid grid-cols-[140px_1fr] gap-4">
          <Skeleton className="aspect-[63/88]" />
          <div className="grid content-start gap-3">
            <Skeleton className="h-6" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-40" />
      </div>
    )
  }
  if (!product) return <NotFound />

  const set = sets?.find((s) => s.id === product.set)
  const variants = variantOrder(Object.keys(product.v))
  const variant = pickVariant(product, search.get('v'))
  const vp = variant ? product.v[variant] : undefined
  const market = vp?.[0] ?? null
  const low = vp?.[1] ?? null
  const shown = market ?? low
  const sealed = product.kind === 'sealed'
  const units = unitsFromSeed(seed.data)
  const callout = lowCallout(market, low)
  const flip = callout ? flipAtLow(market, low) : null
  const upcoming = !!(product.presale && (product.released ?? set?.released) && (product.released ?? set!.released) > todayIso())
  const releaseDate = product.released ?? set?.released
  const chase = !!set?.chase.some((c) => c[0] === product.id)
  const myWatch = me && watch ? findWatch(watch, me.id, product.id, variant) : undefined
  const owned = (myVault ?? []).filter((v) => v.productId === product.id)
  const subject = { productId: product.id, name: displayName(product.name), variant, multi: variants.length > 1, market: shown, kind: product.kind }

  const needMe = (fn: () => void) => () => (me ? fn() : toast('Pick who you are first (your name, top right).', 'error'))
  const title = displayName(product.name)

  const heading = (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {product.presale && <Badge tone="holo">Presale</Badge>}
        {set && <Badge>{set.lang === 'EN' ? 'English' : 'Japanese'}</Badge>}
        {product.rarity && product.rarity !== 'None' && <Badge tone="accent">{product.rarity}</Badge>}
        {sealed && <Badge>Sealed</Badge>}
      </div>
      <h1 className="text-[22px] leading-tight font-bold tracking-tight lg:text-[30px]">{title}</h1>
      <p className="mt-1 text-[13.5px] text-ink-2">
        {set ? (
          <Link to={`/market/set/${set.id}`} className="font-medium text-accent underline-offset-2 hover:underline">
            {setLabel(set)}
          </Link>
        ) : (
          'Unknown set'
        )}
        {product.num && <span className="tabular"> · #{product.num}</span>}
      </p>
      {upcoming && releaseDate && (
        <p className="mt-1 text-[13px] text-ink-3">
          Releases {shortDate(releaseDate)} ({relDays(releaseDate)})
        </p>
      )}
    </div>
  )

  const priceBlock = (
    <div>
      <div className="flex items-end gap-2.5">
        <div>
          <div className="text-[12px] text-ink-3">Market</div>
          <div className="text-[34px] leading-none font-bold tracking-tight lg:text-[40px]">
            <CountUp value={market ?? low} format={(n) => money(n)} />
          </div>
        </div>
        {vp?.[3] != null && (
          <div className="pb-1">
            <Delta value={vp[3]} className="text-[14px]" />
            <div className="text-[11px] text-ink-3">7 days</div>
          </div>
        )}
      </div>
      <div className="mt-2 text-[13px] text-ink-2">
        {low != null ? (
          <>
            Lowest listing <span className="font-semibold text-ink tabular">{money(low)}</span>
          </>
        ) : (
          'No listings with a price right now'
        )}
        {market == null && low != null && ' (no market price yet)'}
      </div>
      {!sealed && shown != null && shown >= units.pack && (
        <div className="mt-1.5 text-[12.5px] text-ink-3">≈ {asMsrpUnits(shown, units)} at retail</div>
      )}
    </div>
  )

  const actions = (
    <>
      <Button variant={myWatch ? 'secondary' : 'primary'} onClick={needMe(() => setWatchOpen(true))} className="flex-1 lg:w-full">
        {myWatch ? <Check size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
        {myWatch ? 'Watching' : 'Watch'}
      </Button>
      <Button onClick={needMe(() => setVaultOpen(true))} className="flex-1 lg:w-full" aria-label="Add to vault">
        <Gem size={17} aria-hidden />
        Vault{owned.length > 0 && <span className="rounded-full bg-surface-3 px-1.5 text-[11px] tabular">{owned.reduce((n, v) => n + v.qty, 0)}</span>}
      </Button>
      <Link
        to={`/tools?tab=deal&product=${product.id}`}
        aria-label="Check a deal"
        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 px-4 text-sm font-medium transition select-none hover:border-line-strong active:scale-[0.98] lg:w-full"
      >
        <Calculator size={17} aria-hidden />
        <span className="sm:hidden">Deal</span>
        <span className="hidden sm:inline">Check a deal</span>
      </Link>
    </>
  )

  return (
    <div className="pb-16 lg:pb-0">
      <ShimmerStyles />
      <Link to={set ? `/market/set/${set.id}` : '/market'} className="mb-2 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
        <ChevronLeft size={16} aria-hidden /> {set ? setLabel(set) : 'Market'}
      </Link>

      <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
        <aside className="self-start lg:sticky lg:top-8">
          <div className="grid grid-cols-[136px_minmax(0,1fr)] gap-4 sm:grid-cols-[180px_minmax(0,1fr)] lg:block">
            <button type="button" onClick={() => setZoom(true)} aria-label="Enlarge image" className={cx('block w-full self-start rounded-xl text-left shadow-card', chase && 'mm-shimmer')}>
              <ProductThumb id={product.id} kind={product.kind} size="lg" className="rounded-xl" />
            </button>
            <div className="grid min-w-0 grid-cols-1 content-start gap-4 lg:hidden">
              {heading}
              {priceBlock}
            </div>
          </div>
          <div className="mt-4 hidden gap-2 lg:grid">{actions}</div>
        </aside>

        <div className="mt-5 grid min-w-0 grid-cols-1 content-start gap-5 lg:mt-0">
          <div className="hidden grid-cols-1 gap-4 lg:grid">
            {heading}
            {priceBlock}
          </div>

          {variants.length > 1 && (
            <div role="radiogroup" aria-label="Variant" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
              {variants.map((c) => {
                const m = product.v[c][0] ?? product.v[c][1]
                const on = c === variant
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setSearch({ v: c }, { replace: true })}
                    className={cx('min-h-14 shrink-0 rounded-xl border px-4 py-1.5 text-left transition', on ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong')}
                  >
                    <div className="text-[13px] font-medium">{variantLabel(c)}</div>
                    <div className="text-[13px] text-ink-2 tabular">{money(m)}</div>
                  </button>
                )
              })}
            </div>
          )}

          {callout && (
            <div className="holo-ring rounded-2xl bg-surface p-4">
              <div className="flex items-start gap-3">
                <Tag size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <div>
                  <div className="font-semibold">Listings under market right now</div>
                  <p className="mt-0.5 text-[13.5px] text-ink-2">
                    The cheapest listing is <span className="font-semibold text-ink tabular">{money(low)}</span>, {Math.round(Math.abs(callout.pct) * 100)}% below the {money(market)} market price.
                  </p>
                  {flip != null && flip > 0 && (
                    <p className="mt-1 text-[13px] text-ink-2">
                      Same card at market would net about <span className="font-semibold text-up tabular">+{money(flip)}</span> after TCGplayer fees (estimate).
                    </p>
                  )}
                  <p className="mt-1.5 text-[12.5px] text-ink-3">The lowest listing can be a worse condition (played or damaged). Check the photo and condition before you count on it.</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {WINDOWS.map((w) => (
              <ChangeCell key={w} days={w} value={vp?.[w === 1 ? 2 : w === 7 ? 3 : 4]} />
            ))}
          </div>
          <HistoryPanel product={product} variant={variant} market={shown} euHint={!sealed && !!product.num && set?.lang === 'EN'} />

          <EuPanel product={product} setName={set?.name ?? ''} variant={variant} />

          {sealed ? <SealedPanel product={product} market={shown} seed={seed.data} units={units} /> : <PullPanel product={product} set={set} setProducts={setProducts} price={shown} units={units} />}

          <FriendsStatus productId={product.id} people={people} me={me} />

          <ResearchLinks product={product} set={set} />
          <OtherPrintings product={product} set={set} />
        </div>
      </div>

      {/* Phone: actions pinned above the tab bar, in thumb reach. */}
      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 flex gap-2 border-t border-line bg-bg/92 px-4 py-2 backdrop-blur-md lg:hidden">{actions}</div>

      <WatchSheet open={watchOpen} onClose={() => setWatchOpen(false)} subject={subject} existing={myWatch} me={me} />
      <VaultSheet open={vaultOpen} onClose={() => setVaultOpen(false)} subject={subject} owned={owned} me={me} />
      <ImageZoom product={product} open={zoom} onClose={() => setZoom(false)} />
    </div>
  )
}
