// Three ways to see a collection that numbers alone don't give: set completion (how close you are
// to finishing a set, and what it costs), where the value sits, and who's moving.
import { ChevronDown, PartyPopper, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { ProductThumb, setLabel } from '../../components/product.tsx'
import { Badge, Card, Delta, Section, Segmented, cx } from '../../components/ui.tsx'
import { money, shortDate } from '../../lib/format.ts'
import type { Slice } from '../../lib/vaultBreakdown.ts'
import type { Mover, MoverWindow } from '../../lib/vaultMovers.ts'
import type { SetProgress } from '../../lib/vaultSets.ts'
import { itemName } from './ItemList.tsx'

// ---------- set completion ----------

function Ring({ pctDone, size = 52, done }: { pctDone: number; size?: number; done: boolean }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(pctDone * 100)}% complete`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--grid)" strokeWidth={5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={done ? 'var(--up)' : 'var(--series-market)'}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${Math.max(pctDone > 0 ? 2 : 0, pctDone * c)} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dy="0.35em" textAnchor="middle" className="fill-ink tabular" fontSize={size * 0.26} fontWeight={600}>
        {Math.round(pctDone * 100)}%
      </text>
    </svg>
  )
}

function SetCard({ p }: { p: SetProgress }) {
  const [open, setOpen] = useState(false)
  const name = setLabel(p.set)
  const cheapest = p.missing.slice(0, 5)
  return (
    <Card holo={p.complete} className="p-3.5">
      <div className="flex items-center gap-3">
        <Ring pctDone={p.pct} done={p.complete} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold">{name}</span>
            {p.set.lang === 'JP' && <Badge className="!px-1.5 !py-0 !text-[10px]">JP</Badge>}
          </div>
          <div className="text-[12px] text-ink-3 tabular">
            {p.owned} of {p.total} cards
          </div>
          {p.complete ? (
            <div className="mt-0.5 flex items-center gap-1 text-[13px] font-medium">
              <Sparkles size={13} className="text-accent" aria-hidden /> Set complete
            </div>
          ) : (
            <div className="mt-0.5 text-[13px] text-ink-2">
              {p.remaining} more to complete {name}
              {p.missingCost > 0 && <> · about {money(p.missingCost)} at market</>}
            </div>
          )}
        </div>
        {!p.complete && p.missing.length > 0 && (
          <button type="button" aria-expanded={open} aria-label={`Cheapest missing cards in ${name}`} onClick={() => setOpen(!open)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink">
            <ChevronDown size={18} className={cx('transition', open && 'rotate-180')} />
          </button>
        )}
      </div>
      {open && (
        <div className="fade-in mt-3 border-t border-line pt-2">
          <div className="mb-1 text-[12px] text-ink-3">Cheapest cards you're missing</div>
          <ul>
            {cheapest.map((m) => (
              <li key={m.id}>
                <a href={`#/item/${m.id}`} className="flex min-h-11 items-center gap-2.5 rounded-lg px-1 hover:bg-surface-2">
                  <ProductThumb id={m.id} size="sm" className="!w-7" />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{m.name}</span>
                  <span className="shrink-0 text-[13px] font-medium tabular">{m.price != null ? money(m.price) : 'No price'}</span>
                </a>
              </li>
            ))}
          </ul>
          {p.remaining > cheapest.length && (
            <p className="mt-1 text-[12px] text-ink-3">
              and {p.remaining - cheapest.length} more{p.unpricedMissing > 0 ? ` (${p.unpricedMissing} unpriced, not in the total)` : ''}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

export function SetCompletion({ progress }: { progress: SetProgress[] }) {
  const [all, setAll] = useState(false)
  if (!progress.length) return null
  const done = progress.filter((p) => p.complete)
  const todo = progress.filter((p) => !p.complete)
  const shown = all ? todo : todo.slice(0, 3)
  return (
    <Section title="Set completion" sub={done.length ? `${done.length} complete. ${todo.length} to go.` : 'Cards you own against the full set'} className="!mb-0">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
        {done.map((p) => (
          <SetCard key={p.set.id} p={p} />
        ))}
        {shown.map((p) => (
          <SetCard key={p.set.id} p={p} />
        ))}
      </div>
      {todo.length > 3 && (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 min-h-11 text-[13px] font-medium text-accent">
          {all ? 'Show fewer' : `Show all ${todo.length} sets in progress`}
        </button>
      )}
    </Section>
  )
}

// ---------- value breakdown ----------

function BarList({ slices, unit }: { slices: Slice[]; unit: string }) {
  const [hot, setHot] = useState<string | null>(null)
  const max = Math.max(...slices.map((s) => s.value), 1)
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-3.5">
      {slices.map((s) => (
        <li key={s.key} className="relative" onPointerEnter={() => setHot(s.key)} onPointerLeave={() => setHot(null)} onFocus={() => setHot(s.key)} onBlur={() => setHot(null)} tabIndex={0} aria-label={`${s.label}: ${money(s.value)}, ${Math.round(s.share * 100)}% of the total, ${s.units} ${unit}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[13px]">{s.label}</span>
            <span className="shrink-0 text-[13px] font-medium tabular">
              {money(s.value)} <span className="font-normal text-ink-3">· {Math.round(s.share * 100)}%</span>
            </span>
          </div>
          <div className="mt-1.5 h-2">
            <div className="h-full rounded-r-[4px] transition-[width,opacity] duration-300" style={{ width: `${Math.max(1.5, (s.value / max) * 100)}%`, background: 'var(--series-market)', opacity: hot && hot !== s.key ? 0.45 : 1 }} />
          </div>
          {hot === s.key && (
            <div className="pointer-events-none absolute -top-1 right-0 z-10 -translate-y-full rounded-xl border border-line bg-surface-3 px-3 py-2 text-[12px] shadow-xl">
              <div className="font-semibold tabular">{money(s.value)}</div>
              <div className="text-ink-3">
                {s.label} · {s.units} {unit}
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export function ValueBreakdown({ bySet, byRarity }: { bySet: Slice[]; byRarity: Slice[] }) {
  const [by, setBy] = useState<'set' | 'rarity'>('set')
  const slices = by === 'set' ? bySet : byRarity
  if (!bySet.length && !byRarity.length) return null
  return (
    <Section title="Where the value is" action={<Segmented className="[&>button]:min-h-11" options={[{ value: 'set', label: 'By set' }, { value: 'rarity', label: 'By rarity' }]} value={by} onChange={setBy} />} className="!mb-0">
      <Card className="p-4">
        <BarList slices={slices} unit="items" />
      </Card>
    </Section>
  )
}

// ---------- movers ----------

function MoverRow({ m }: { m: Mover }) {
  return (
    <li>
      <a href={`#/item/${m.row.item.productId}`} className="flex min-h-12 items-center gap-2.5 rounded-lg px-1 hover:bg-surface-2">
        <ProductThumb id={m.row.item.productId} kind={m.row.product?.kind ?? 'card'} size="sm" className="!w-8" />
        <span className="min-w-0 flex-1 truncate text-[13px]">{itemName(m.row)}</span>
        <span className="shrink-0 text-right">
          <span className={cx('block text-[13px] font-semibold tabular', m.change >= 0 ? 'text-up' : 'text-down')}>
            {m.change >= 0 ? '+' : '−'}
            {money(Math.abs(m.change))}
          </span>
          {m.pct != null && <Delta value={m.pct} digits={0} className="text-[11.5px]" />}
        </span>
      </a>
    </li>
  )
}

export function Movers({ byWindow, historyStart }: { byWindow: Record<MoverWindow, { up: Mover[]; down: Mover[] }>; historyStart?: string }) {
  const [w, setW] = useState<MoverWindow>('added')
  const cur = byWindow[w]
  const none = !cur.up.length && !cur.down.length
  return (
    <Section
      title="Your movers"
      action={<Segmented className="[&>button]:min-h-11" options={[{ value: 'added', label: 'Since added' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }]} value={w} onChange={setW} />}
      className="!mb-0"
    >
      <Card className="p-3">
        {none ? (
          <p className="px-1 py-3 text-[13px] text-ink-3">
            {w === 'added'
              ? 'Winners and losers show up once your items have a cost saved to compare against.'
              : `Needs ${w === '7d' ? 'a week' : 'a month'} of price history${historyStart ? `. Tracking started ${shortDate(historyStart)}` : ''}, so there's nothing to rank yet.`}
          </p>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)]">
            {cur.up.length > 0 && (
              <div className="min-w-0">
                <div className="mb-0.5 flex items-center gap-1.5 px-1 text-[12px] font-medium text-ink-3">
                  <PartyPopper size={12} aria-hidden /> Winners
                </div>
                <ul>
                  {cur.up.map((m) => (
                    <MoverRow key={m.row.item.id} m={m} />
                  ))}
                </ul>
              </div>
            )}
            {cur.down.length > 0 && (
              <div className="min-w-0">
                <div className="mb-0.5 px-1 text-[12px] font-medium text-ink-3">Losers</div>
                <ul>
                  {cur.down.map((m) => (
                    <MoverRow key={m.row.item.id} m={m} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
      {w === 'added' && !none && <p className="mt-1.5 text-[12px] text-ink-3">Current market vs what you paid. Market isn't a guaranteed sale price.</p>}
    </Section>
  )
}
