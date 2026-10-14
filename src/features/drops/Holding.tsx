import { Info } from 'lucide-react'
import { Badge, Card, Delta, Empty, Money, Section } from '../../components/ui.tsx'
import type { HoldingProduct, HoldingRow } from '../../lib/drops.ts'
import { shortDate } from '../../lib/format.ts'
import { msrpText } from './util.ts'

const TYPE_LABEL: Record<string, string> = { 'booster-box': 'Booster box', etb: 'Elite Trainer Box', 'pc-etb': 'Pokémon Center ETB', bundle: 'Booster bundle' }

function Line({ p, trend }: { p: HoldingProduct; trend: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
      <div className="min-w-0">
        <div className="text-[13.5px]">{TYPE_LABEL[p.sealed] ?? p.name}</div>
        <div className="mt-0.5 text-[12px] text-ink-3">{p.msrp != null ? `MSRP ${msrpText(p.msrp)}` : 'MSRP unknown'}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[14px] font-semibold">
          <Money value={p.market} />
        </div>
        <div className="text-[12px] text-ink-3">{p.vsMsrp != null ? <><Delta value={p.vsMsrp} digits={0} /> vs MSRP</> : 'market'}</div>
      </div>
      {trend && (
        <div className="w-[88px] shrink-0 text-right">
          {p.tracked ? (
            <>
              <Delta value={p.tracked.change} digits={0} className="text-[13.5px]" />
              <div className="text-[12px] text-ink-3">{p.tracked.sinceRelease ? 'since release' : `since ${shortDate(p.tracked.from)}`}</div>
            </>
          ) : (
            <div className="text-[12px] leading-tight text-ink-3">no trend yet</div>
          )}
        </div>
      )}
    </li>
  )
}

function SetCard({ r }: { r: HoldingRow }) {
  const inWindow = r.weeks >= 6 && r.weeks <= 10
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-[15px] font-semibold">{r.name.replace(/^Mega Evolution\s*[—–-]\s*/, '')}</h3>
        {r.code && <span className="text-[13px] text-ink-3">{r.code}</span>}
        {inWindow && <Badge tone="warning">In the 6 to 10 week window</Badge>}
      </div>
      <p className="mt-0.5 text-[12.5px] text-ink-3">
        Out {r.weeks === 0 ? 'this week' : `${r.weeks} ${r.weeks === 1 ? 'week' : 'weeks'}`}
        {r.weeks > 0 ? ' · released ' : ' · '}
        {shortDate(r.date)}
      </p>
      <ul className="mt-1.5">
        {r.products.map((p) => (
          <Line key={p.productId} p={p} trend={r.products.some((x) => x.tracked)} />
        ))}
      </ul>
    </Card>
  )
}

/** EN sets from the last year: market against MSRP today, and the move since we started watching. */
export function Holding({ rows, historyDays }: { rows: HoldingRow[]; historyDays: number }) {
  return (
    <Section title="Recently released: holding up?" sub="Boxes, ETBs and bundles from English sets in the last year, against MSRP.">
      <div className="mb-3 flex gap-2.5 rounded-2xl border border-line bg-surface-2/60 p-3.5 text-[13px] text-ink-2">
        <Info size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
        <p>
          <span className="font-medium text-ink">A pattern from the last two main sets, not a forecast:</span> Chaos Rising and Pitch Black sealed boxes fell about 17 to 24% within 6 to 10 weeks of release. Our price history has {historyDays} {historyDays === 1 ? 'day' : 'days'} so far, so the change column fills in as days go by.
        </p>
      </div>
      {rows.length === 0 ? (
        <Empty title="No priced sets yet">English sets from the last year show up here once TCGplayer prices are in.</Empty>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <SetCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </Section>
  )
}

