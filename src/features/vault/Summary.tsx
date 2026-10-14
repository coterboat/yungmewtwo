// The vault's headline: market value (have + trade), cost basis, unrealized and realized P&L, a
// plain-language equivalent, and value over time. Numbers follow whatever the filters scope.
import { ArrowDownRight, ArrowUpRight, Info, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { PriceChart } from '../../components/PriceChart.tsx'
import { Card, Segmented, cx } from '../../components/ui.tsx'
import { money, pct, shortDate } from '../../lib/format.ts'
import { sliceRange, type ValueSeries, type VaultSummary } from '../../lib/vault.ts'
import { pickEquivalent, type EquivUnit } from '../../lib/vaultFun.ts'
import { CountUpMoney } from './common.tsx'

function Signed({ n, pctValue, className }: { n: number; pctValue?: number | null; className?: string }) {
  const flat = Math.abs(n) < 0.005
  const up = n > 0
  return (
    <span className={cx('inline-flex flex-wrap items-baseline gap-x-1.5 font-semibold tabular', flat ? 'text-ink-2' : up ? 'text-up' : 'text-down', className)}>
      <span className="inline-flex items-center gap-0.5">
        {!flat && (up ? <ArrowUpRight size={16} aria-hidden /> : <ArrowDownRight size={16} aria-hidden />)}
        {flat ? money(0) : `${up ? '+' : '−'}${money(Math.abs(n))}`}
      </span>
      {pctValue != null && <span className="text-[13px] font-medium">({pct(pctValue, 1)})</span>}
    </span>
  )
}

const RANGES: Array<{ value: string; label: string; days: number | null }> = [
  { value: '7', label: '7D', days: 7 },
  { value: '30', label: '30D', days: 30 },
  { value: '90', label: '90D', days: 90 },
  { value: '365', label: '1Y', days: 365 },
  { value: 'all', label: 'All', days: null },
]

export function Summary({
  name,
  summary,
  series,
  units,
  month,
  filtered,
  empty,
}: {
  name: string
  summary: VaultSummary
  series: ValueSeries
  units: EquivUnit[]
  /** Dollar change over the last 30 days and how many held lots had data. */
  month: { change: number; covered: number }
  filtered: boolean
  empty: boolean
}) {
  const [range, setRange] = useState('all')
  const days = RANGES.find((r) => r.value === range)?.days ?? null
  const view = sliceRange(series, days)
  const equiv = pickEquivalent(summary.value, units)
  const monthEquiv = month.covered > 0 && month.change > 0 ? pickEquivalent(month.change, units) : null
  const hasChart = series.dates.length >= 2

  return (
    <Card className="p-5 sm:p-6">
      <div className="text-[13px] text-ink-3">
        {name}'s vault{filtered ? ' (filtered)' : ''} · market value of what's held
      </div>
      <div className="mt-1 text-5xl leading-none font-bold tracking-tight">
        <CountUpMoney value={summary.value} />
      </div>
      {equiv ? (
        <p className="mt-2 flex items-center gap-1.5 text-[14px] text-ink-2">
          <Sparkles size={14} className="shrink-0 text-accent" aria-hidden />
          About {equiv.text} at MSRP ({money(equiv.unit.price)} each)
        </p>
      ) : (
        !empty && <p className="mt-2 text-[14px] text-ink-3">{summary.unpriced ? 'Waiting on market prices for some items.' : 'A good start. Add more to see it in boxes and ETBs.'}</p>
      )}

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
        <div className="min-w-0">
          <div className="text-[12px] text-ink-3">Cost basis</div>
          <div className="mt-0.5 text-[17px] font-semibold tabular">{money(summary.cost)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[12px] text-ink-3">Unrealized</div>
          <div className="mt-0.5">{summary.cost > 0 ? <Signed n={summary.unrealized} pctValue={summary.unrealizedPct} className="text-[17px]" /> : <span className="text-[17px] font-semibold text-ink-3">—</span>}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[12px] text-ink-3">Realized</div>
          <div className="mt-0.5">{summary.soldUnits > 0 ? <Signed n={summary.realized} className="text-[17px]" /> : <span className="text-[17px] font-semibold text-ink-3">—</span>}</div>
          {summary.soldUnits > 0 && <div className="text-[11px] text-ink-3">{money(summary.soldRevenue)} sold</div>}
        </div>
      </div>
      {(summary.uncosted > 0 || summary.unpriced > 0) && (
        <p className="mt-3 flex gap-1.5 text-[12px] text-ink-3">
          <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {summary.uncosted > 0 && `${summary.uncosted} held ${summary.uncosted === 1 ? 'item has' : 'items have'} no cost recorded, so ${summary.uncosted === 1 ? "it's" : "they're"} left out of cost basis and P&L. Enter 0 for pulls. `}
            {summary.unpriced > 0 && `${summary.unpriced} ${summary.unpriced === 1 ? 'has' : 'have'} no market price yet.`}
          </span>
        </p>
      )}
      {month.covered > 0 && (
        <p className="mt-3 text-[13px] text-ink-2">
          Last 30 days:{' '}
          <b className={cx('tabular', month.change >= 0 ? 'text-up' : 'text-down')}>
            {month.change >= 0 ? '+' : '−'}
            {money(Math.abs(month.change))}
          </b>
          {monthEquiv && <> · about {monthEquiv.text}</>}
        </p>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-[13px] font-medium">Value over time</div>
          {series.dates.length > 7 && <Segmented className="[&>button]:min-h-11" options={RANGES.filter((r) => r.days == null || r.days < series.dates.length).map((r) => ({ value: r.value, label: r.label }))} value={range} onChange={setRange} />}
        </div>
        {hasChart ? (
          <PriceChart dates={view.dates} series={[{ key: 'value', label: 'Vault value', color: 'var(--series-market)', values: view.values }]} height={200} />
        ) : series.dates.length === 1 ? (
          <div className="flex items-center gap-4 rounded-xl bg-surface-2 px-4 py-4">
            <div className="h-3 w-3 shrink-0 rounded-full border-2 border-surface bg-[var(--series-market)] ring-2 ring-[var(--series-market)]" aria-hidden />
            <p className="text-[13px] text-ink-2">
              Price history starts {shortDate(series.dates[0])}, so there is one day on the books. The line draws itself as nightly prices come in.
            </p>
          </div>
        ) : (
          <p className="rounded-xl bg-surface-2 px-4 py-4 text-[13px] text-ink-3">Add cards or sealed product you hold to see their value over time.</p>
        )}
        {hasChart && (
          <p className="mt-1.5 text-[12px] text-ink-3">
            What you hold today, at each day's market prices.
            {series.flat > 0 && ` ${series.flat} ${series.flat === 1 ? 'item has' : 'items have'} no history yet and ${series.flat === 1 ? 'is' : 'are'} held flat.`}
          </p>
        )}
      </div>
    </Card>
  )
}
