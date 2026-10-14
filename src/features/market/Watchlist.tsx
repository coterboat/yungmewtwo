// The Watchlist tab: everything either of you is watching, with distance to target.
import { Binoculars, CheckCircle2, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProductThumb, setLabel } from '../../components/product.tsx'
import { Badge, Button, Card, Delta, Empty, Money, Segmented, Skeleton, cx } from '../../components/ui.tsx'
import { variantLabel } from '../../lib/classify.ts'
import { useSetMap } from '../../lib/data.ts'
import { money } from '../../lib/format.ts'
import { buyState, displayName, pickVariant, sellState, type TargetState } from '../../lib/market.ts'
import { useProducts } from '../../lib/market-hooks.ts'
import { personName, useMe, usePeople } from '../../lib/people.ts'
import type { SiteProduct } from '../../lib/site.ts'
import type { Person, WatchItem } from '../../lib/user.ts'
import { useUserFile } from '../../lib/userData.ts'
import { PersonDot, Progress } from './parts.tsx'

interface Row {
  w: WatchItem
  p: SiteProduct | undefined
  variant: string | undefined
  market: number | null
  low: number | null
  change7d: number | null
  buy: TargetState | null
  sell: TargetState | null
}

/** Reached targets first, then closest to a target, then plain tracking. */
function rowRank(r: Row): number {
  if (r.buy?.hit || r.sell?.hit) return -1
  const gaps = [r.buy && Math.abs(r.buy.needPct), r.sell && Math.abs(r.sell.needPct)].filter((g): g is number => g != null)
  return gaps.length ? Math.min(...gaps) : 99
}

function TargetLine({ kind, s, market }: { kind: 'buy' | 'sell'; s: TargetState; market: number | null }) {
  const verb = kind === 'buy' ? 'Buy at or under' : 'Sell at or over'
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
        <span className="text-ink-2" aria-label={`${verb} ${money(s.target)}`}>
          {kind === 'buy' ? 'Buy ≤' : 'Sell ≥'} <span className="font-semibold text-ink tabular">{money(s.target)}</span>
        </span>
        {s.hit ? (
          <span className="inline-flex items-center gap-1 font-semibold text-up">
            <CheckCircle2 size={14} aria-hidden /> Reached
          </span>
        ) : (
          <span className="text-ink-3 tabular">
            {market != null ? `${Math.round(Math.abs(s.needPct) * 100)}% ${kind === 'buy' ? 'to fall' : 'to rise'} · ${money(Math.abs(s.gap))} away` : ''}
          </span>
        )}
      </div>
      <Progress ratio={s.ratio} hit={s.hit} className="mt-1.5" />
    </div>
  )
}

function WatchCard({ r, people, showWho }: { r: Row; people: Person[]; showWho: boolean }) {
  const sets = useSetMap()
  const who = people.find((x) => x.id === r.w.by)
  const reached = r.buy?.hit || r.sell?.hit
  const to = `/item/${r.w.productId}${r.variant ? `?v=${encodeURIComponent(r.variant)}` : ''}`
  if (!r.p) {
    return (
      <Card className="p-4 text-sm text-ink-3">
        Product {r.w.productId} isn't in the price list anymore.
        {showWho && <span> · {personName(people, r.w.by)}</span>}
      </Card>
    )
  }
  const set = sets?.get(r.p.set)
  const hasTarget = r.buy || r.sell
  return (
    <Card to={to} holo={reached} className="p-3.5">
      <div className="flex gap-3">
        <ProductThumb id={r.p.id} kind={r.p.kind} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold">{displayName(r.p.name)}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-ink-3">
                {set && <span className="truncate">{setLabel(set)}</span>}
                {r.p.num && <span className="tabular">· {r.p.num.split('/')[0]}</span>}
                {r.variant && Object.keys(r.p.v).length > 1 && <span>· {variantLabel(r.variant)}</span>}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[15px] font-semibold">
                <Money value={r.market} />
              </div>
              {r.change7d != null && <Delta value={r.change7d} className="text-[12px]" />}
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {showWho && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
                <PersonDot person={who} size={18} /> {personName(people, r.w.by)}
              </span>
            )}
            {reached && <Badge tone="holo">Target reached</Badge>}
            {r.low != null && r.market != null && r.low < r.market * 0.9 && (
              <span className="text-[12px] text-ink-3">
                Cheapest listing <span className="tabular text-ink-2">{money(r.low)}</span>
              </span>
            )}
          </div>
        </div>
      </div>
      <div className={cx('mt-3 grid grid-cols-1 gap-2.5', r.buy && r.sell && 'sm:grid-cols-2')}>
        {r.buy && <TargetLine kind="buy" s={r.buy} market={r.market} />}
        {r.sell && <TargetLine kind="sell" s={r.sell} market={r.market} />}
        {!hasTarget && <p className="text-[12.5px] text-ink-3">No target set. Open it to add a buy or sell price.</p>}
      </div>
      {r.w.note && <p className="mt-2.5 border-t border-line pt-2 text-[12.5px] text-ink-2">{r.w.note}</p>}
    </Card>
  )
}

export function Watchlist({ onFind }: { onFind: () => void }) {
  const { data: watch } = useUserFile<WatchItem>('watch')
  const people = usePeople()
  const me = useMe()
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const all = useMemo(() => watch ?? [], [watch])
  const mine = me ? all.filter((w) => w.by === me.id) : []
  const effective = !me ? 'all' : scope
  const items = effective === 'mine' ? mine : all
  const { products, loading } = useProducts(useMemo(() => all.map((w) => w.productId), [all]))

  const rows = useMemo<Row[]>(() => {
    const out = items.map((w): Row => {
      const p = products.get(w.productId)
      const variant = p ? pickVariant(p, w.variant) : w.variant
      const vp = p && variant ? p.v[variant] : undefined
      const market = vp ? (vp[0] ?? vp[1]) : null
      return { w, p, variant, market, low: vp?.[1] ?? null, change7d: vp?.[3] ?? null, buy: buyState(market, w.target), sell: sellState(market, w.above) }
    })
    return out.sort((a, b) => rowRank(a) - rowRank(b))
  }, [items, products])

  if (!watch) return <Skeleton className="h-40" />

  const nudge = (
    <Button variant="primary" onClick={onFind}>
      <Search size={16} aria-hidden /> Find something to watch
    </Button>
  )

  if (!all.length) {
    return (
      <Empty icon={<Binoculars size={20} />} title="Nothing on the watchlist yet" action={nudge}>
        Open any card or sealed product and tap Watch. Set a buy price and this list shows how far each one is from it, every day. A good start is a chase card you'd grab at 10% under market.
      </Empty>
    )
  }

  const reached = rows.filter((r) => r.buy?.hit || r.sell?.hit).length
  const otherCount = all.length - mine.length

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-3">
          {items.length} on watch{reached > 0 && ` · ${reached} at target`}
        </p>
        {me && (
          <Segmented
            size="sm"
            value={effective}
            onChange={setScope}
            options={[
              { value: 'mine', label: `Mine (${mine.length})` },
              { value: 'all', label: `Everyone (${all.length})` },
            ]}
          />
        )}
      </div>
      {!items.length ? (
        <Empty icon={<Binoculars size={20} />} title="You're not watching anything yet" action={<div className="flex flex-wrap justify-center gap-2">{nudge}<Button onClick={() => setScope('all')}>See the shared list</Button></div>}>
          {otherCount} {otherCount === 1 ? 'item is' : 'items are'} on the shared list. Open any product and tap Watch to add your own target.
        </Empty>
      ) : loading ? (
        <div className="grid gap-3">
          {items.slice(0, 4).map((w) => (
            <Skeleton key={w.id} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <WatchCard key={r.w.id} r={r} people={people} showWho={effective === 'all'} />
          ))}
        </div>
      )}
      <p className="mt-4 text-[12px] text-ink-3">
        Distances use TCGplayer's market price, which tracks recent sales. A listing can still be cheaper;{' '}
        <Link to="/tools?tab=deal" className="text-accent underline underline-offset-2">
          check a deal
        </Link>{' '}
        against it.
      </p>
    </div>
  )
}
