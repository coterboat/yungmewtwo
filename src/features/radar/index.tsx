// Radar: the home screen. One ranked list of what needs you now, then glanceable sections the
// viewer can reorder or hide (saved on this device).
import { ArrowDown, ArrowUp, Bell, CalendarClock, CalendarDays, ExternalLink, Eye, EyeOff, Gem, Megaphone, Newspaper, PackageOpen, PartyPopper, ScanLine, Settings2, Sparkles, Tag, Target, Timer, TrendingDown, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ProductThumb, setLabel } from '../../components/product.tsx'
import { displayName } from '../../lib/classify.ts'
import { Badge, Button, Card, Delta, Empty, Money, Section, Sheet, Skeleton, cx } from '../../components/ui.tsx'
import { useMeta, useMovers, useSetMap } from '../../lib/data.ts'
import { ago, countdown, money, shortDate } from '../../lib/format.ts'
import { useNow } from '../../lib/hooks.ts'
import { personName, useMe, usePeople } from '../../lib/people.ts'
import { getPrefs, setPrefs, usePrefs } from '../../lib/prefs.ts'
import { buildAttention, type Attention, type PriceInfo } from '../../lib/radar.ts'
import type { Post, Recurring, VaultItem, WatchItem } from '../../lib/user.ts'
import { useUserFile } from '../../lib/userData.ts'
import { heroRelease, preorderStatus, type DropRelease } from '../../lib/drops.ts'
import type { NewsItem } from '../../lib/dropsNews.ts'
import { localToday, useDrops, useNews } from '../drops/hooks.ts'
import { usePrices } from './usePrices.ts'

const SECTIONS: Array<{ id: string; label: string }> = [
  { id: 'now', label: 'Needs you now' },
  { id: 'drop', label: 'Next drop' },
  { id: 'watch', label: 'Watchlist' },
  { id: 'news', label: 'Hunt-worthy news' },
  { id: 'board', label: 'From the board' },
  { id: 'vault', label: 'Your vault' },
  { id: 'market', label: 'Market pulse' },
]

const KIND_ICON: Record<Attention['kind'], ReactNode> = {
  drawing: <PartyPopper size={18} />,
  drop: <Timer size={18} />,
  deal: <Tag size={18} />,
  weekly: <CalendarClock size={18} />,
  target: <Target size={18} />,
  sell: <TrendingUp size={18} />,
  under: <TrendingDown size={18} />,
  post: <Megaphone size={18} />,
  news: <Newspaper size={18} />,
  preorder: <PackageOpen size={18} />,
  release: <CalendarDays size={18} />,
}

function useSectionOrder() {
  const { radarOrder, radarHidden } = usePrefs()
  const ids = SECTIONS.map((s) => s.id)
  const order = [...radarOrder.filter((id) => ids.includes(id)), ...ids.filter((id) => !radarOrder.includes(id))]
  return { order, hidden: new Set(radarHidden) }
}

export default function RadarPage() {
  const me = useMe()
  const people = usePeople()
  const now = useNow(30_000)
  const posts = useUserFile<Post>('posts')
  const recurring = useUserFile<Recurring>('recurring')
  const watch = useUserFile<WatchItem>('watch')
  const vault = useUserFile<VaultItem>(`vault-${me?.id ?? 'alex'}`)
  const drops = useDrops()
  const news = useNews()
  const [customize, setCustomize] = useState(false)
  const { order, hidden } = useSectionOrder()
  const [lastSeen] = useState(() => getPrefs().radarSeenAt ?? undefined)

  // Mark the board as seen a few seconds after the radar is opened.
  useEffect(() => {
    const t = setTimeout(() => setPrefs({ radarSeenAt: new Date().toISOString() }), 4000)
    return () => clearTimeout(t)
  }, [])

  const myWatch = useMemo(() => (watch.data ?? []).filter((w) => !me || w.by === me.id), [watch.data, me])
  const held = useMemo(() => (vault.data ?? []).filter((v) => v.status === 'have' || v.status === 'trade'), [vault.data])
  const ids = useMemo(() => [...myWatch.map((w) => w.productId), ...held.map((v) => v.productId)], [myWatch, held])
  const variants = useMemo(() => Object.fromEntries([...myWatch, ...held].map((x) => [x.productId, x.variant])), [myWatch, held])
  const prices = usePrices(ids, variants)

  const attention = useMemo(() => {
    const info = new Map<number, PriceInfo>()
    prices?.forEach((p, id) => info.set(id, { name: p.product.name, market: p.market, low: p.low }))
    return buildAttention({ posts: posts.data ?? [], recurring: recurring.data ?? [], watch: watch.data ?? [], prices: info, me: me?.id, now, lastSeen, news: news.data?.items, releases: drops.data?.releases })
  }, [posts.data, recurring.data, watch.data, prices, me, now, lastSeen, news.data, drops.data])

  const urgent = attention.filter((a) => a.urgency >= 60).length
  const sections: Record<string, ReactNode> = {
    now: <NowSection items={attention} loading={!posts.data} now={now} kinds={prices} />,
    drop: <NextDropSection releases={drops.data?.releases} now={now} />,
    news: <NewsSection items={news.data?.items} />,
    watch: <WatchSection items={myWatch} prices={prices} />,
    board: <BoardSection posts={posts.data} people={people} />,
    vault: <VaultSection items={held} prices={prices} />,
    market: <MarketSection />,
  }

  return (
    <div className="fade-in">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-ink-3">{new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="mt-0.5 text-[26px] leading-tight font-bold tracking-tight">
            {greeting(now)}
            {me ? `, ${me.name}` : ''}
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {urgent ? (
              <>
                <span className="font-semibold text-ink">{urgent} thing{urgent === 1 ? '' : 's'}</span> need{urgent === 1 ? 's' : ''} you now.
              </>
            ) : (
              'Nothing urgent. Good time to log a store visit or set a price target.'
            )}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setCustomize(true)} aria-label="Customize radar">
          <Settings2 size={16} /> <span className="hidden sm:inline">Customize</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
        {order
          .filter((id) => !hidden.has(id))
          .map((id) => (
            <div key={id} className={cx('min-w-0', id === 'now' && 'lg:col-span-2')}>
              {sections[id]}
            </div>
          ))}
      </div>

      <CustomizeSheet open={customize} onClose={() => setCustomize(false)} order={order} hidden={hidden} />
    </div>
  )
}

function greeting(now: number) {
  const h = new Date(now).getHours()
  return h < 5 ? 'Late night hunt' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'
}

function NowSection({ items, loading, now, kinds }: { items: Attention[]; loading: boolean; now: number; kinds: ReturnType<typeof usePrices> }) {
  return (
    <Section title="Needs you now" sub="Deadlines, drops and price hits, most urgent first">
      {loading ? (
        <div className="grid gap-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : items.length === 0 ? (
        <Empty icon={<Sparkles size={20} />} title="All clear" action={<Button onClick={() => (location.hash = '#/board?new=drawing')}>Post a drawing</Button>}>
          Drawings, drops, weekly events and price targets show up here as they get close. Set a target on any card to get pinged when it hits.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {items.slice(0, 8).map((a) => (
            <AttentionCard key={a.id} a={a} now={now} kind={a.productId ? kinds?.get(a.productId)?.product.kind : undefined} />
          ))}
        </div>
      )}
    </Section>
  )
}

function AttentionCard({ a, now, kind }: { a: Attention; now: number; kind?: 'card' | 'sealed' }) {
  const live = a.when ? Date.parse(a.when) <= now : false
  return (
    <Card to={a.external ? undefined : a.href} onClick={a.external ? () => window.open(a.href, '_blank', 'noopener') : undefined} holo={a.tone === 'holo'} className="p-3.5">
      <div className="flex items-center gap-3">
        {a.productId ? (
          <ProductThumb id={a.productId} kind={kind} size="sm" />
        ) : (
          <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', a.tone === 'calm' ? 'bg-surface-2 text-ink-2' : 'bg-accent-soft text-accent')}>{KIND_ICON[a.kind]}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold">{a.title}</div>
          <div className="truncate text-[12.5px] text-ink-2">{a.detail}</div>
        </div>
        {a.external && <ExternalLink size={16} className="shrink-0 text-ink-3" aria-label="Opens the post" />}
        {a.when && (
          <div className="shrink-0 text-right">
            <div className={cx('text-[15px] font-bold tabular', a.tone === 'holo' && 'holo-text')}>{live ? 'Live' : countdown(a.when, now)}</div>
            <div className="text-[11px] text-ink-3">{live ? 'now' : a.kind === 'drawing' ? 'left' : 'to go'}</div>
          </div>
        )}
      </div>
    </Card>
  )
}

function NextDropSection({ releases, now }: { releases: DropRelease[] | undefined; now: number }) {
  const today = localToday(now)
  const next = releases ? heroRelease(releases, today) : undefined
  if (!releases) return null
  if (!next?.date) return null
  const days = Math.max(0, Math.round((Date.parse(`${next.date}T00:00:00`) - now) / 86_400_000))
  const pre = preorderStatus(next, today)
  const premium = next.products.filter((p) => p.premium != null && p.tcg?.market != null).sort((a, b) => (b.tcg?.market ?? 0) - (a.tcg?.market ?? 0)).slice(0, 2)
  return (
    <Section title="Next drop" action={<Link to="/drops" className="text-[13px] font-medium text-accent">Drops</Link>}>
      <Card to="/drops" className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold tracking-tight">{next.name}</div>
            <div className="text-[13px] text-ink-2">
              {shortDate(next.date)}
              {next.prerelease && ` · prereleases ${shortDate(next.prerelease.start)}–${shortDate(next.prerelease.end)}`}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[30px] leading-none font-bold tabular">{days}</div>
            <div className="text-[11px] text-ink-3">day{days === 1 ? '' : 's'}</div>
          </div>
        </div>
        <div className="mt-3 text-[13px] text-ink-2">
          {pre.state === 'opened' && <>Pre-orders opened {shortDate(pre.date)}{pre.where ? ` at ${pre.where}` : ''}.</>}
          {pre.state === 'opens' && <>Pre-orders open {shortDate(pre.date)}{pre.where ? ` at ${pre.where}` : ''}.</>}
          {pre.state === 'predicted' && <>Pre-orders likely {pre.inWindow ? 'any day now' : `from ${shortDate(pre.from)}`} ({pre.basis}).</>}
          {pre.state === 'due' && <>Pre-orders are overdue by the usual pattern: watch Pokémon Center.</>}
        </div>
        {premium.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-1.5">
            {premium.map((p) => (
              <div key={p.label} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-ink-2">{p.label}</span>
                <span className="shrink-0 tabular">
                  <span className="font-semibold">{money(p.tcg?.market)}</span> <span className="text-[12px] text-ink-3">MSRP {money(p.msrp)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Section>
  )
}

const HOT_TAGS = ['price-error', 'drawing', 'restock', 'preorder', 'deal']

function NewsSection({ items }: { items: NewsItem[] | undefined }) {
  const hot = (items ?? []).filter((n) => n.watch?.length || n.tags.some((t) => HOT_TAGS.includes(t))).slice(0, 5)
  if (!items) return null
  return (
    <Section title="Hunt-worthy news" sub="Drawings, restocks, pre-orders and deals from PokéBeach and Reddit" action={<Link to="/drops" className="text-[13px] font-medium text-accent">All news</Link>}>
      {hot.length === 0 ? (
        <Empty icon={<Newspaper size={20} />} title="Quiet right now">New drawings, restocks and price errors show up here as they're posted.</Empty>
      ) : (
        <Card className="divide-y divide-line">
          {hot.map((n) => (
            <a key={n.id} href={n.link} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[14px] font-medium">{n.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
                  <span>{ago(n.date)}</span>
                  {n.tags.filter((t) => HOT_TAGS.includes(t)).slice(0, 2).map((t) => (
                    <Badge key={t} tone={t === 'price-error' ? 'critical' : 'neutral'}>{t.replace('-', ' ')}</Badge>
                  ))}
                  {n.watch?.length ? <Badge tone="accent">watchlist</Badge> : null}
                </div>
              </div>
              <ExternalLink size={15} className="mt-1 shrink-0 text-ink-3" />
            </a>
          ))}
        </Card>
      )}
    </Section>
  )
}

function WatchSection({ items, prices }: { items: WatchItem[]; prices: ReturnType<typeof usePrices> }) {
  const sets = useSetMap()
  return (
    <Section title="Watchlist" sub="How close each card is to your price" action={<Link to="/market" className="text-[13px] font-medium text-accent">All</Link>}>
      {items.length === 0 ? (
        <Empty icon={<Bell size={20} />} title="Nothing watched yet">
          Open any card or product and tap Watch to set a buy target. You'll get a phone alert when the market or a listing hits it.
        </Empty>
      ) : (
        <Card className="p-1.5">
          {items.slice(0, 6).map((w) => {
            const p = prices?.get(w.productId)
            const progress = w.target && p?.market ? Math.min(1, w.target / p.market) : null
            return (
              <Link key={w.id} to={`/item/${w.productId}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                <ProductThumb id={w.productId} kind={p?.product.kind} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{p ? displayName(p.product.name) : '…'}</div>
                  <div className="truncate text-[12px] text-ink-3">{setLabel(p ? sets?.get(p.product.set) : undefined)}</div>
                  {progress != null && (
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div className={cx('h-full rounded-full', progress >= 1 ? 'bg-up' : 'bg-accent')} style={{ width: `${progress * 100}%` }} />
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[14px] font-semibold">
                    <Money value={p?.market} />
                  </div>
                  <div className="text-[11.5px] text-ink-3">{w.target ? `target ${money(w.target)}` : <Delta value={p?.change7d} />}</div>
                </div>
              </Link>
            )
          })}
        </Card>
      )}
    </Section>
  )
}

function BoardSection({ posts, people }: { posts: Post[] | undefined; people: ReturnType<typeof usePeople> }) {
  const recent = (posts ?? []).filter((p) => !p.archived).slice(0, 4)
  return (
    <Section title="From the board" sub="Latest deals, drawings and drops you two posted" action={<Link to="/board" className="text-[13px] font-medium text-accent">Board</Link>}>
      {!posts ? (
        <Skeleton className="h-28" />
      ) : recent.length === 0 ? (
        <Empty icon={<Megaphone size={20} />} title="The board is empty" action={<Button onClick={() => (location.hash = '#/board?new=deal')}>Post a deal</Button>}>
          Post deals, drawings and drop times here instead of texting them. You'll both get a phone alert.
        </Empty>
      ) : (
        <Card className="divide-y divide-line">
          {recent.map((p) => (
            <Link key={p.id} to="/board" className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: people.find((x) => x.id === p.by)?.color ?? 'var(--text-3)' }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{p.title}</div>
                <div className="text-[12px] text-ink-3">
                  {personName(people, p.by)} · {p.type} · {ago(p.at)}
                </div>
              </div>
              {p.price != null && <Money value={p.price} className="text-[14px] font-semibold" />}
            </Link>
          ))}
        </Card>
      )}
    </Section>
  )
}

function VaultSection({ items, prices }: { items: VaultItem[]; prices: ReturnType<typeof usePrices> }) {
  let value = 0
  let cost = 0
  let day = 0
  for (const v of items) {
    const p = prices?.get(v.productId)
    if (p?.market != null) {
      value += p.market * v.qty
      if (p.change1d != null) day += (p.market - p.market / (1 + p.change1d)) * v.qty
    }
    if (v.cost != null) cost += v.cost * v.qty
  }
  return (
    <Section title="Your vault" action={<Link to="/vault" className="text-[13px] font-medium text-accent">Vault</Link>}>
      {items.length === 0 ? (
        <Empty icon={<Gem size={20} />} title="Start your library" action={<Link to="/scan"><Button variant="primary"><ScanLine size={16} /> Scan your cards</Button></Link>}>
          Snap a binder page or a pile and every card gets added and priced. Its value tracks itself, and Flip to Fund shows what to sell for the card you actually want.
        </Empty>
      ) : (
        <Card className="p-4">
          <div className="text-[12px] text-ink-3">Market value · {items.length} items</div>
          <div className="mt-1 text-[32px] leading-none font-bold tracking-tight">
            <Money value={value} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {cost > 0 && (
              <span className="text-ink-2">
                vs cost <Money value={cost} /> <Delta value={cost ? value / cost - 1 : null} />
              </span>
            )}
            {day !== 0 && (
              <span className={cx('tabular', day > 0 ? 'text-up' : 'text-down')}>
                {day > 0 ? '+' : '−'}
                {money(Math.abs(day))} today
              </span>
            )}
          </div>
        </Card>
      )}
    </Section>
  )
}

function MarketSection() {
  const movers = useMovers()
  const meta = useMeta()
  const sets = useSetMap()
  const up = movers.data?.windows['1'].up.length ? movers.data.windows['1'] : movers.data?.windows['7']
  const days = meta.data?.dates.length ?? 0
  return (
    <Section title="Market pulse" sub={meta.data ? `Prices as of ${shortDate(meta.data.latest)} · ${days} day${days === 1 ? '' : 's'} of history` : undefined} action={<Link to="/market" className="text-[13px] font-medium text-accent">Market</Link>}>
      {!movers.data ? (
        <Skeleton className="h-28" />
      ) : !up || (!up.up.length && !up.down.length) ? (
        <Empty icon={<TrendingUp size={20} />} title="Movers start tomorrow">
          Price history began {meta.data ? shortDate(meta.data.dates[0]) : 'recently'}. After the next nightly pull you'll see what jumped and what dropped.
        </Empty>
      ) : (
        <Card className="p-1.5">
          {[...up.up.slice(0, 3), ...up.down.slice(0, 2)].map((m) => (
            <Link key={`${m.id}:${m.variant}`} to={`/item/${m.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
              <ProductThumb id={m.id} kind={m.kind} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{displayName(m.name)}</div>
                <div className="truncate text-[12px] text-ink-3">{setLabel(sets?.get(m.set))}</div>
              </div>
              <div className="shrink-0 text-right">
                <Money value={m.market} className="text-[14px] font-semibold" />
                <div>
                  <Delta value={m.change} className="text-[12px]" />
                </div>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </Section>
  )
}

function CustomizeSheet({ open, onClose, order, hidden }: { open: boolean; onClose: () => void; order: string[]; hidden: Set<string> }) {
  const move = (id: string, dir: -1 | 1) => {
    const next = [...order]
    const i = next.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setPrefs({ radarOrder: next })
  }
  const toggle = (id: string) => {
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPrefs({ radarHidden: [...next] })
  }
  return (
    <Sheet open={open} onClose={onClose} title="Customize your radar">
      <p className="mb-3 text-sm text-ink-2">Reorder or hide sections. Saved on this device.</p>
      <div className="grid gap-2">
        {order.map((id, i) => {
          const s = SECTIONS.find((x) => x.id === id)!
          const off = hidden.has(id)
          return (
            <div key={id} className={cx('flex items-center gap-2 rounded-xl border border-line bg-surface-2 py-1 pr-1 pl-4', off && 'opacity-55')}>
              <span className="flex-1 text-sm font-medium">{s.label}</span>
              <Button variant="ghost" size="sm" aria-label="Move up" disabled={i === 0} onClick={() => move(id, -1)}>
                <ArrowUp size={16} />
              </Button>
              <Button variant="ghost" size="sm" aria-label="Move down" disabled={i === order.length - 1} onClick={() => move(id, 1)}>
                <ArrowDown size={16} />
              </Button>
              <Button variant="ghost" size="sm" aria-label={off ? 'Show' : 'Hide'} onClick={() => toggle(id)}>
                {off ? <EyeOff size={16} /> : <Eye size={16} />}
              </Button>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}
