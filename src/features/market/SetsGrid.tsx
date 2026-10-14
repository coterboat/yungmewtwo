// The Sets tab: every set in the chosen language, newest first, with master-set value and the top card.
import { Layers, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ProductThumb, setLabel } from '../../components/product.tsx'
import { Badge, Button, Card, Empty, Input, Section, Skeleton, Toggle } from '../../components/ui.tsx'
import { useData, useSets } from '../../lib/data.ts'
import { money, relDays, shortDate } from '../../lib/format.ts'
import { groupSets, type MsrpSeed } from '../../lib/market.ts'
import { todayIso, useHistoryStatus } from '../../lib/market-hooks.ts'
import { boxesLabel, unitsFromSeed, type PackUnits } from '../../lib/market-pulls.ts'
import type { SetSummary } from '../../lib/site.ts'

const PAGE = 48

export function SetCard({ s, dated, units }: { s: SetSummary; dated: boolean; units: PackUnits }) {
  const top = s.chase[0]
  const today = todayIso()
  const upcoming = dated && s.released > today
  return (
    <Card to={`/market/set/${s.id}`} className="flex gap-3 p-3">
      {top ? (
        <ProductThumb id={top[0]} kind="card" size="md" className="self-start" />
      ) : (
        <div className="flex aspect-[63/88] w-12 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-3" aria-hidden>
          <Layers size={18} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{setLabel(s)}</div>
            <div className="mt-0.5 truncate text-[12px] text-ink-3">
              {dated ? (upcoming ? `Releases ${shortDate(s.released)} · ${relDays(s.released)}` : shortDate(s.released)) : 'Release date not listed'}
              {s.cards > 0 && ` · ${s.cards} ${s.cards === 1 ? 'card' : 'cards'}`}
              {s.sealedCount > 0 && ` · ${s.sealedCount} sealed`}
            </div>
          </div>
          {s.abbr && <Badge className="shrink-0">{s.abbr}</Badge>}
        </div>
        {s.value > 0 ? (
          <div className="mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[17px] font-semibold tabular">{money(s.value, { compact: true })}</span>
              <span className="text-[11.5px] text-ink-3">master set (est.)</span>
            </div>
            {s.lang === 'EN' && <div className="text-[12px] text-ink-3">≈ {boxesLabel(s.value, units)}</div>}
            {top && (
              <div className="mt-1 truncate text-[12px] text-ink-3" title={top[1]}>
                Top: {top[1].split(' - ')[0]} <span className="tabular text-ink-2">{money(top[2], { compact: true })}</span>
                <span className="tabular"> · {Math.round((top[2] / s.value) * 100)}% of value</span>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2 text-[12.5px] text-ink-3">{s.cards ? 'No card prices yet' : 'No cards listed yet, sealed only'}</div>
        )}
      </div>
    </Card>
  )
}

function Block({ title, sub, sets, dated, units }: { title: string; sub?: string; sets: SetSummary[]; dated: boolean; units: PackUnits }) {
  const [shown, setShown] = useState(PAGE)
  if (!sets.length) return null
  return (
    <Section title={title} sub={sub}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sets.slice(0, shown).map((s) => (
          <SetCard key={s.id} s={s} dated={dated} units={units} />
        ))}
      </div>
      {sets.length > shown && (
        <div className="mt-3 text-center">
          <Button onClick={() => setShown(shown + PAGE)}>Show more ({sets.length - shown} left)</Button>
        </div>
      )}
    </Section>
  )
}

export function SetsGrid({ lang }: { lang: 'EN' | 'JP' }) {
  const { data, loading } = useSets()
  const status = useHistoryStatus()
  const seed = useData<MsrpSeed>('seed/msrp.json')
  const units = unitsFromSeed(seed.data)
  const [query, setQuery] = useState('')
  const [extras, setExtras] = useState(false)
  const groups = useMemo(() => (data && status ? groupSets(data, { lang, trackingStart: status.first, today: todayIso(), query, showExtras: extras }) : undefined), [data, status, lang, query, extras])

  if (loading || !groups) return <Skeleton className="h-64" />
  const total = groups.upcoming.length + groups.released.length + groups.undated.length

  return (
    <div>
      <div className="mb-5 grid grid-cols-1 gap-1 sm:flex sm:items-center sm:gap-4">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Filter ${lang} sets (name or code)`} aria-label="Filter sets" className="pl-9" />
        </div>
        <div className="sm:w-64">
          <Toggle checked={extras} onChange={setExtras} label="Show promos and extras" />
        </div>
      </div>

      {!total ? (
        <Empty icon={<Layers size={20} />} title="No sets match">
          {extras ? 'Try a shorter name or the set code.' : 'Promos and other extras are hidden. Turn them on to include them.'}
        </Empty>
      ) : (
        <>
          <Block title="Upcoming" sub="Listed as presale, soonest first." sets={groups.upcoming} dated units={units} />
          <Block title="Released" sub={lang === 'EN' ? 'Newest first. Master-set value is every card at its top price, shown in booster boxes at retail.' : 'Newest first. Master-set value is every card at its top price.'} sets={groups.released} dated units={units} />
          <Block title="Release date not listed" sub="TCGplayer has no real date for these (older sets, promos and oddities). Sorted by master-set value." sets={groups.undated} dated={false} units={units} />
        </>
      )}
    </div>
  )
}
