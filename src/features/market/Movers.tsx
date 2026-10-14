// The Movers tab: biggest risers and fallers over 1, 7 or 30 days, from movers.json.
import { LineChart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ProductRow } from '../../components/product.tsx'
import { Card, Delta, Empty, ErrorNote, Money, Segmented, Skeleton } from '../../components/ui.tsx'
import { useMovers, useSetMap } from '../../lib/data.ts'
import { money, shortDate } from '../../lib/format.ts'
import { displayName, WINDOWS, type Window } from '../../lib/market.ts'
import { useHistoryStatus, useIsWide } from '../../lib/market-hooks.ts'
import type { Mover } from '../../lib/site.ts'

type KindFilter = 'all' | 'card' | 'sealed'

function MoverList({ list, empty }: { list: Mover[]; empty: string }) {
  const sets = useSetMap()
  if (!list.length) return <p className="px-2 py-6 text-center text-sm text-ink-3">{empty}</p>
  return (
    <div className="divide-y divide-line">
      {list.slice(0, 25).map((m) => (
        <ProductRow
          key={`${m.id}:${m.variant}`}
          id={m.id}
          name={displayName(m.name)}
          kind={m.kind}
          set={sets?.get(m.set)}
          variant={m.variant}
          to={`/item/${m.id}?v=${encodeURIComponent(m.variant)}`}
          right={
            <div className="shrink-0 text-right">
              <div className="text-[14px] font-semibold">
                <Money value={m.market} />
              </div>
              <div className="flex items-center justify-end gap-1.5 text-[12px]">
                <span className="hidden text-ink-3 tabular sm:inline">from {money(m.from)}</span>
                <Delta value={m.change} />
              </div>
            </div>
          }
        />
      ))}
    </div>
  )
}

export function Movers({ lang }: { lang: 'EN' | 'JP' }) {
  const { data, loading, error } = useMovers()
  const sets = useSetMap()
  const status = useHistoryStatus()
  const wide = useIsWide(900)
  const [picked, setPicked] = useState<Window | null>(null)
  const [kind, setKind] = useState<KindFilter>('all')
  const [side, setSide] = useState<'up' | 'down'>('up')

  const win: Window = picked ?? (status?.ready[7] ? 7 : status?.ready[1] ? 1 : 7)
  const raw = data?.windows[String(win) as '1' | '7' | '30']

  const filtered = useMemo(() => {
    const keep = (m: Mover) => (kind === 'all' || m.kind === kind) && (!sets || sets.get(m.set)?.lang === lang)
    return { up: (raw?.up ?? []).filter(keep), down: (raw?.down ?? []).filter(keep) }
  }, [raw, kind, lang, sets])

  if (error) return <ErrorNote>Couldn't load movers ({error.message}). Reload the page to try again.</ErrorNote>
  if (loading || !data || !status) return <Skeleton className="h-48" />

  const ready = status.ready[win]
  const nothingAtAll = !raw || (!raw.up.length && !raw.down.length)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={String(win) as '1' | '7' | '30'}
          onChange={(v) => setPicked(Number(v) as Window)}
          options={WINDOWS.map((w) => ({ value: String(w) as '1' | '7' | '30', label: `${w} ${w === 1 ? 'day' : 'days'}` }))}
        />
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'All' },
            { value: 'card', label: 'Cards' },
            { value: 'sealed', label: 'Sealed' },
          ]}
        />
        {!wide && (
          <Segmented
            value={side}
            onChange={setSide}
            className="ml-auto"
            options={[
              { value: 'up', label: 'Risers' },
              { value: 'down', label: 'Fallers' },
            ]}
          />
        )}
      </div>

      {!ready || nothingAtAll ? (
        <Empty icon={<LineChart size={20} />} title={ready ? `No ${win}-day movers yet` : `${win}-day movers aren't available yet`}>
          {ready
            ? 'Nothing moved enough to list (cards need to be over $5 and sealed over $20, and move 5% or more).'
            : status.first
              ? `Price history started ${shortDate(status.first)}, so there's nothing to compare against. ${win}-day movers start showing around ${shortDate(status.appears[win]!)}, after the nightly pull that day.`
              : 'There is no price history yet.'}
          {!ready && win !== 1 && status.ready[1] === false && status.appears[1] && <> The 1-day list comes first, around {shortDate(status.appears[1])}.</>}
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
          {(wide || side === 'up') && (
            <Card className="p-2">
              <h3 className="px-2 pt-1.5 pb-1 text-[13px] font-semibold text-ink-2">Risers · {win}-day</h3>
              <MoverList list={filtered.up} empty={`No risers in ${lang} ${kind === 'all' ? 'products' : kind === 'card' ? 'cards' : 'sealed'}.`} />
            </Card>
          )}
          {(wide || side === 'down') && (
            <Card className="p-2">
              <h3 className="px-2 pt-1.5 pb-1 text-[13px] font-semibold text-ink-2">Fallers · {win}-day</h3>
              <MoverList list={filtered.down} empty={`No fallers in ${lang} ${kind === 'all' ? 'products' : kind === 'card' ? 'cards' : 'sealed'}.`} />
            </Card>
          )}
        </div>
      )}
      <p className="mt-3 text-[12px] text-ink-3">Market price is TCGplayer's recent-sales figure. Cheap cards and tiny moves are left out so one-dollar swings don't crowd the list.</p>
    </div>
  )
}
