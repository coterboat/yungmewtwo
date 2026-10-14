// The Sealed vs MSRP tab: what trades far above retail (worth grabbing at MSRP) and what sits at
// or under it (a buy zone), from sealed.json.
import { ArrowRight, PackageOpen } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProductThumb, setLabel } from '../../components/product.tsx'
import { Badge, Button, Card, Chips, Empty, Money, Section, Segmented, Skeleton, cx } from '../../components/ui.tsx'
import { useData, useSealed, useSetMap } from '../../lib/data.ts'
import { money, shortDate } from '../../lib/format.ts'
import { closestToMsrp, msrpRows, ratioLabel, SEALED_LABEL, splitMsrp, type MsrpRow, type MsrpSeed } from '../../lib/market.ts'
import { todayIso } from '../../lib/market-hooks.ts'
import type { SealedType } from '../../lib/types.ts'

const SHOWN = 12

function Row({ r, mode }: { r: MsrpRow; mode: 'above' | 'under' | 'near' }) {
  const sets = useSetMap()
  const s = r.row
  const set = sets?.get(s.set)
  const upcoming = s.presale && s.released && s.released > todayIso()
  return (
    <div className="flex items-start gap-3 px-2 py-2.5">
      <Link to={`/item/${s.id}`} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg hover:opacity-90">
        <ProductThumb id={s.id} kind="sealed" size="sm" />
        <div className="min-w-0">
          <div className="line-clamp-2 text-[14px] leading-snug font-medium">{s.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-ink-3">
            <span>{[setLabel(set), SEALED_LABEL[s.sealed]].filter(Boolean).join(' · ')}</span>
            {s.presale && <Badge tone="accent" className="!py-0 !text-[10.5px]">{upcoming && s.released ? `Presale · ${shortDate(s.released)}` : 'Presale'}</Badge>}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-2 tabular">
            {r.perPack != null && <span>{money(r.perPack)}/pack</span>}
            {mode === 'above' ? (
              <span className={cx(r.est > 0 ? 'text-up' : 'text-ink-3')}>
                {r.est > 0 ? `Est. +${money(r.est)}` : 'Est. no profit'} if bought at MSRP
              </span>
            ) : (
              <span className="text-ink-3">{r.ratio < 0.995 ? `${Math.round((1 - r.ratio) * 100)}% under retail` : r.ratio <= 1.02 ? 'At retail' : `${Math.round((r.ratio - 1) * 100)}% over retail`}</span>
            )}
          </div>
        </div>
      </Link>
      <div className="shrink-0 text-right">
        <div className="text-[15px] font-semibold">
          <Money value={s.market} />
        </div>
        <div className="text-[12px] text-ink-3 tabular" title={r.conf === 'high' ? undefined : 'Derived or single-source MSRP'}>
          MSRP {money(r.msrp)}
          {(r.conf === 'med' || r.conf === 'low') && ' est.'}
        </div>
        <div className={cx('text-[13px] font-semibold tabular', mode === 'above' ? 'text-up' : 'text-ink-2')}>{ratioLabel(r.ratio)}</div>
      </div>
    </div>
  )
}

function Group({ title, sub, rows, mode, empty }: { title: string; sub: string; rows: MsrpRow[]; mode: 'above' | 'under' | 'near'; empty: string }) {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, SHOWN)
  return (
    <Section title={title} sub={sub}>
      {rows.length ? (
        <Card className="divide-y divide-line p-1.5">
          {shown.map((r) => (
            <Row key={r.row.id} r={r} mode={mode} />
          ))}
          {rows.length > SHOWN && (
            <div className="p-2">
              <Button variant="ghost" size="sm" onClick={() => setAll(!all)} className="w-full">
                {all ? 'Show fewer' : `Show all ${rows.length}`}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-3">{empty}</p>
      )}
    </Section>
  )
}

export function SealedVsMsrp({ lang }: { lang: 'EN' | 'JP' }) {
  const { data, loading } = useSealed()
  const seed = useData<MsrpSeed>('seed/msrp.json')
  const [order, setOrder] = useState<'ratio' | 'profit'>('ratio')
  const [type, setType] = useState<'all' | SealedType>('all')

  const all = useMemo(() => (data ? msrpRows(data, 'EN', seed.data) : []), [data, seed.data])
  const types = useMemo(() => {
    const counts = new Map<SealedType, number>()
    for (const r of all) counts.set(r.row.sealed, (counts.get(r.row.sealed) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1])
  }, [all])
  const filtered = useMemo(() => (type === 'all' ? all : all.filter((r) => r.row.sealed === type)), [all, type])
  const { above, under } = useMemo(() => splitMsrp(filtered, order), [filtered, order])
  const closest = useMemo(() => closestToMsrp(filtered, 12), [filtered])

  if (loading || seed.loading || !data) return <Skeleton className="h-64" />
  if (!all.length) {
    return (
      <Empty icon={<PackageOpen size={20} />} title="No sealed prices to compare yet">
        This tab needs sealed products that have both a market price and a known MSRP.
      </Empty>
    )
  }

  return (
    <div>
      {lang === 'JP' && <p className="mb-3 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">MSRP tracking covers English products only, so this tab shows EN regardless of the JP toggle.</p>}
      <div className="mb-4 grid grid-cols-1 gap-3">
        <Chips<string>
          value={type}
          onChange={(v) => setType(v as 'all' | SealedType)}
          options={[{ value: 'all', label: 'All sealed', count: all.length }, ...types.map(([t, n]) => ({ value: t, label: SEALED_LABEL[t], count: n }))]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-ink-3">Order by</span>
          <Segmented
            size="sm"
            value={order}
            onChange={setOrder}
            options={[
              { value: 'ratio', label: 'Biggest premium' },
              { value: 'profit', label: 'Est. profit' },
            ]}
          />
        </div>
      </div>

      <Group
        title="Trading furthest above MSRP"
        sub="If you can buy these at retail, this is the gap. Presale items are what stores take preorders for."
        rows={above}
        mode="above"
        empty="Nothing in this filter is trading 5% or more over MSRP."
      />
      {under.length > 0 || !closest.length ? (
        <Group
          title="At or under MSRP"
          sub="Market is no higher than retail: a fair place to stock up or buy to open."
          rows={under}
          mode="under"
          empty="Nothing in this filter is at or under MSRP right now."
        />
      ) : (
        <Group title="Closest to MSRP" sub="Nothing is at or under retail right now. These have the smallest premium: the best odds of a fair price." rows={closest} mode="near" empty="" />
      )}

      <p className="flex items-start gap-1.5 text-[12px] leading-snug text-ink-3">
        <ArrowRight size={13} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Market is TCGplayer's recent-sales price. Estimated profit subtracts TCGplayer fees (13.25% + $0.30) and about $2 to $10 shipping by product size, so treat it as a ballpark. MSRPs come from a hand-kept list; "est." marks ones derived from other products or a single source. Displays, cases and product types whose price varies are left out.
        </span>
      </p>
    </div>
  )
}
