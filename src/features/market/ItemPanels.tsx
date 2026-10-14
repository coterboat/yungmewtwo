// The panels on an item page that aren't the price or the chart: EU second opinion, pull odds,
// sealed math, research links, other printings, and who else is on this item.
import { Dices, ExternalLink, Minus, PackageOpen, TrendingDown, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProductRow, setLabel } from '../../components/product.tsx'
import { Badge, Card, Section, Skeleton, cx } from '../../components/ui.tsx'
import { variantLabel } from '../../lib/classify.ts'
import { useData, useIndex, useSetMap } from '../../lib/data.ts'
import { money, shortDate } from '../../lib/format.ts'
import { displayName, estimateSealedFlip, eur, msrpFor, perPack, ratioLabel, type MsrpSeed } from '../../lib/market.ts'
import { oddsLabel, packsAsProducts, pullOdds, pullSetFor, type PackUnits, type PullRates } from '../../lib/market-pulls.ts'
import { researchLinks } from '../../lib/market-research.ts'
import { cleanCardName, getEuPrice, trendSignal, type EuCard } from '../../lib/market-tcgdex.ts'
import type { SetSummary, SiteProduct } from '../../lib/site.ts'
import type { Person, VaultItem, WatchItem } from '../../lib/user.ts'
import { useUserFile } from '../../lib/userData.ts'
import { PersonDot } from './parts.tsx'

// ---------- Cardmarket (EU) second opinion ----------

export function EuPanel({ product, setName, variant }: { product: SiteProduct; setName: string; variant: string | undefined }) {
  const eligible = product.kind === 'card' && !!product.num
  const [state, setState] = useState<{ id: number; card: EuCard | null } | undefined>()
  useEffect(() => {
    if (!eligible) return
    let live = true
    setState(undefined)
    getEuPrice({ productId: product.id, name: product.name, num: product.num!, setName }).then((card) => live && setState({ id: product.id, card }))
    return () => {
      live = false
    }
  }, [eligible, product.id, product.name, product.num, setName])

  if (!eligible) return null
  if (!state || state.id !== product.id) return <Skeleton className="h-28" />
  if (!state.card) return null
  const reverse = variant === 'R' && state.card.reverse
  const p = reverse || state.card.normal
  const signal = trendSignal(p.avg7, p.avg30)
  const Icon = signal?.dir === 'up' ? TrendingUp : signal?.dir === 'down' ? TrendingDown : Minus
  const pct = signal ? `${Math.round(Math.abs(signal.pct) * 100)}%` : ''
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold">Cardmarket (EU)</h3>
        <span className="text-[12px] text-ink-3">
          {reverse ? 'Reverse holo · ' : ''}via TCGdex{state.card.updated ? ` · ${shortDate(state.card.updated.slice(0, 10))}` : ''}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {[
          ['Trend', p.trend],
          ['7-day avg', p.avg7],
          ['30-day avg', p.avg30],
        ].map(([label, v]) => (
          <div key={label as string}>
            <div className="text-[12px] text-ink-3">{label}</div>
            <div className="text-[17px] font-semibold tabular">{eur(v as number | null)}</div>
          </div>
        ))}
      </div>
      {signal && (
        <p className="mt-3 flex items-start gap-2 text-[13px] text-ink-2">
          <Icon size={16} className={cx('mt-0.5 shrink-0', signal.dir === 'up' ? 'text-up' : signal.dir === 'down' ? 'text-down' : 'text-ink-3')} aria-hidden />
          <span>
            {signal.dir === 'flat'
              ? 'The 7-day average is in line with the 30-day one: steady in Europe.'
              : signal.dir === 'up'
                ? `The 7-day average is ${pct} above the 30-day one: heating up in Europe.`
                : `The 7-day average is ${pct} below the 30-day one: cooling off in Europe.`}{' '}
            <span className="text-ink-3">A trend signal from a different market, in euros, not a price you'd pay here.</span>
          </span>
        </p>
      )}
    </Card>
  )
}

// ---------- pull odds ----------

export function PullPanel({ product, set, setProducts, price, units }: { product: SiteProduct; set: SetSummary | undefined; setProducts: SiteProduct[] | undefined; price: number | null; units: PackUnits }) {
  const rates = useData<PullRates>('seed/pullrates.json')
  const odds = useMemo(() => {
    if (product.kind !== 'card' || !set || !setProducts || !rates.data) return null
    const ps = pullSetFor(rates.data, set)
    if (!ps) return null
    const same = setProducts.filter((p) => p.kind === 'card' && p.rarity === product.rarity).length
    return pullOdds(ps, product.rarity, same, price, units)
  }, [product, set, setProducts, rates.data, price, units])
  if (!odds) return null
  const times = odds.buyPrice ? odds.costToPull / odds.buyPrice : null
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <Dices size={17} className="text-accent" aria-hidden /> Pull odds
        </h3>
        <Badge>Estimate</Badge>
      </div>
      <div className="mt-2 text-[26px] leading-tight font-bold tracking-tight">{oddsLabel(odds.packsForOne)}</div>
      <p className="mt-0.5 text-[14px] text-ink-2">
        That's roughly {packsAsProducts(odds.packsForOne, units)} of packs to open for one copy.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-3">
        <div>
          <div className="text-[12px] text-ink-3">Open packs for it</div>
          <div className="text-[16px] font-semibold tabular">~{money(Math.round(odds.costToPull / 10) * 10 || odds.costToPull)}</div>
          <div className="text-[12px] text-ink-3">at retail pack prices</div>
        </div>
        <div>
          <div className="text-[12px] text-ink-3">Buy it now</div>
          <div className="text-[16px] font-semibold tabular">{money(odds.buyPrice)}</div>
          <div className="text-[12px] text-ink-3 tabular">{odds.buyInPacks != null ? `= ${Math.round(odds.buyInPacks).toLocaleString('en-US')} packs at retail` : 'no market price'}</div>
        </div>
      </div>
      {odds.cheaperToBuy != null && times != null && (
        <p className="mt-3 text-[13.5px] font-medium">
          {odds.cheaperToBuy ? (times >= 1.5 ? `Buying it is about ${Math.round(times)}× cheaper than opening packs for it.` : 'Buying it costs a bit less than chasing it in packs.') : 'Chasing it in packs is the cheaper route on paper, if you get average luck.'}
        </p>
      )}
      <p className="mt-2 text-[12px] leading-snug text-ink-3">
        From community pull rates (one {product.rarity} per {odds.tierPerPack} packs, shared by {odds.cardsInTier} cards; {odds.confidence ?? 'unknown'} confidence). Averages: real luck swings a lot, and you'd keep the other cards from every pack.
      </p>
    </Card>
  )
}

// ---------- sealed ----------

export function SealedPanel({ product, market, seed, units }: { product: SiteProduct; market: number | null; seed: MsrpSeed | undefined; units: PackUnits }) {
  const m = msrpFor({ id: product.id, name: product.name, sealed: product.sealed, msrp: product.msrp }, seed)
  const pp = perPack(market, product.packs)
  const diff = m && market != null ? market - m.msrp : null
  const flip = m && market != null && market > m.msrp * 1.05 ? estimateSealedFlip(market, m.msrp, product.sealed) : null
  const est = m && (m.conf === 'med' || m.conf === 'low') ? ' est.' : ''
  return (
    <Card className="p-4">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold">
        <PackageOpen size={17} className="text-accent" aria-hidden /> Sealed
      </h3>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <div className="text-[12px] text-ink-3">MSRP</div>
          <div className="text-[17px] font-semibold tabular">
            {m ? money(m.msrp) : '—'}
            <span className="text-[12px] font-normal text-ink-3">{est}</span>
          </div>
        </div>
        <div>
          <div className="text-[12px] text-ink-3">Market ÷ MSRP</div>
          <div className="text-[17px] font-semibold tabular">{m && market != null ? ratioLabel(market / m.msrp) : '—'}</div>
        </div>
        <div>
          <div className="text-[12px] text-ink-3">Per pack</div>
          <div className="text-[17px] font-semibold tabular">{pp != null ? money(pp) : '—'}</div>
          {product.packs ? (
            <div className="text-[12px] text-ink-3 tabular">{product.packs} {product.packs === 1 ? 'pack' : 'packs'}</div>
          ) : null}
        </div>
      </div>
      {diff != null && m && (
        <p className="mt-3 text-[13.5px]">
          <span className="font-semibold tabular">{Math.abs(diff) < m.msrp * 0.005 ? 'Right at MSRP.' : diff > 0 ? `+${money(diff)} over MSRP.` : `${money(-diff)} under MSRP.`}</span>{' '}
          <span className="text-ink-2">
            {pp != null && product.packs && product.packs > 1 ? `Each pack costs ${money(pp)} here against ${money(units.pack)} at retail.` : ''}
          </span>
        </p>
      )}
      {flip != null && (
        <p className="mt-1.5 text-[13px] text-ink-2">
          Bought at MSRP and sold at market, that's about <span className={cx('font-semibold tabular', flip > 0 ? 'text-up' : 'text-ink')}>{flip > 0 ? '+' : ''}{money(flip)}</span> after TCGplayer fees and shipping (estimate).
        </p>
      )}
      {!m && <p className="mt-3 text-[13px] text-ink-3">No reliable MSRP on file for this one, so there's nothing to compare the market against.</p>}
      <Link to={`/tools?tab=ev&product=${product.id}`} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-accent-soft px-4 text-[14px] font-medium text-ink hover:bg-surface-3">
        Open vs keep sealed
      </Link>
    </Card>
  )
}

// ---------- research ----------

export function ResearchLinks({ product, set }: { product: SiteProduct; set: SetSummary | undefined }) {
  const links = researchLinks({ id: product.id, name: product.name, num: product.num, set: setLabel(set), kind: product.kind, lang: set?.lang ?? 'EN' })
  return (
    <Section title="Check elsewhere" sub="Opens in a new tab. Sold prices beat asking prices.">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {links.map((l) => (
          <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 transition hover:border-line-strong">
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium">{l.label}</span>
              <span className="block truncate text-[12px] text-ink-3">{l.hint}</span>
            </span>
            <ExternalLink size={15} className="shrink-0 text-ink-3" aria-hidden />
          </a>
        ))}
      </div>
    </Section>
  )
}

// ---------- other printings ----------

export function OtherPrintings({ product, set }: { product: SiteProduct; set: SetSummary | undefined }) {
  const { data: rows } = useIndex(set?.lang ?? null)
  const sets = useSetMap()
  const key = useMemo(() => cleanCardName(product.name).toLowerCase(), [product.name])
  const matches = useMemo(() => {
    if (!rows || product.kind !== 'card' || key.length < 3) return []
    return rows.filter((r) => r[3] === 'c' && r[0] !== product.id && cleanCardName(r[1]).toLowerCase() === key).sort((a, b) => (b[7] ?? -1) - (a[7] ?? -1))
  }, [rows, key, product.id, product.kind])
  if (!matches.length) return null
  return (
    <Section title="Other printings" sub={`${matches.length} more ${matches.length === 1 ? 'card' : 'cards'} named ${displayName(cleanCardName(product.name))}, in this set and others, priciest first.`}>
      <Card className="divide-y divide-line p-1.5">
        {matches.slice(0, 5).map((r) => (
          <ProductRow key={r[0]} id={r[0]} name={displayName(r[1])} kind="c" set={sets?.get(r[2])} num={r[4]} variant={r[6]} market={r[7]} change={r[8] ?? undefined} to={`/item/${r[0]}`} />
        ))}
      </Card>
      {matches.length > 5 && (
        <Link to={`/market?q=${encodeURIComponent(cleanCardName(product.name))}&kind=c`} className="mt-2 inline-flex min-h-11 items-center text-[13px] font-medium text-accent hover:underline">
          See all {matches.length + 1} printings
        </Link>
      )}
    </Section>
  )
}

// ---------- who else is on this ----------

function Chip({ person, children }: { person: Person | undefined; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-3 pl-1.5 text-[12.5px] text-ink-2">
      <PersonDot person={person} size={20} />
      {children}
    </span>
  )
}

function PersonStatus({ person, productId, me, watch }: { person: Person; productId: number; me: Person | undefined; watch: WatchItem[] }) {
  const { data: vault } = useUserFile<VaultItem>(`vault-${person.id}`)
  const you = me?.id === person.id
  const who = you ? 'You' : person.name
  const mine = (vault ?? []).filter((v) => v.productId === productId)
  const have = mine.filter((v) => v.status === 'have').reduce((n, v) => n + v.qty, 0)
  const trade = mine.filter((v) => v.status === 'trade').reduce((n, v) => n + v.qty, 0)
  const want = mine.some((v) => v.status === 'want')
  const watching = watch.filter((w) => w.by === person.id && w.productId === productId)
  return (
    <>
      {have > 0 && (
        <Chip person={person}>
          {who} {you ? 'have' : 'has'} {have}
        </Chip>
      )}
      {want && (
        <Chip person={person}>
          {you ? 'You want this' : `${who} wants this`}
        </Chip>
      )}
      {trade > 0 && (
        <Chip person={person}>
          {who} {you ? 'have' : 'has'} {trade} to trade
        </Chip>
      )}
      {watching.map((w) => (
        <Chip key={w.id} person={person}>
          {you ? "You're watching" : `${who} is watching`}
          {w.variant && ` (${variantLabel(w.variant)})`}
          {w.target != null && <span className="tabular"> · buy ≤ {money(w.target)}</span>}
        </Chip>
      ))}
    </>
  )
}

export function FriendsStatus({ productId, people, me }: { productId: number; people: Person[]; me: Person | undefined }) {
  const { data: watch } = useUserFile<WatchItem>('watch')
  return (
    <div className="flex flex-wrap gap-2 empty:hidden" aria-label="Who else has this on their list">
      {people.map((p) => (
        <PersonStatus key={p.id} person={p} productId={productId} me={me} watch={watch ?? []} />
      ))}
    </div>
  )
}
