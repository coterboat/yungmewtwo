import { ExternalLink, Gift } from 'lucide-react'
import { useMemo } from 'react'
import { Badge, Card, Empty, cx } from '../../components/ui.tsx'
import { earlyAndLate, releaseStage, shortName, type DropRelease } from '../../lib/drops.ts'
import { relDays, shortDate, weekday } from '../../lib/format.ts'
import { ConfidenceBadge, Fact, RegionBadge } from './bits.tsx'
import { PairFact, PreorderFact, PrereleaseFact } from './facts.tsx'
import { ProductTable } from './ProductTable.tsx'
import { KIND_LABEL, bareLabel, groupByMonth, msrpText } from './util.ts'

function DateBlock({ date, muted }: { date: string | null; muted?: boolean }) {
  if (!date)
    return (
      <div className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-line-strong text-[12px] font-semibold text-ink-3">TBA</div>
    )
  const d = new Date(`${date}T00:00:00`)
  return (
    <div className={cx('flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-surface-2', muted && 'opacity-70')}>
      <div className="text-[11px] leading-none font-medium text-ink-3">{d.toLocaleDateString('en-US', { month: 'short' })}</div>
      <div className="tabular mt-0.5 text-[20px] leading-none font-bold">{d.getDate()}</div>
    </div>
  )
}

function countdownText(r: DropRelease, today: string): string {
  const stage = releaseStage(r, today)
  if (stage === 'tba') return 'Date not announced'
  const now = new Date(`${today}T00:00:00`)
  const when = relDays(r.date!, now)
  return stage === 'out' ? (when === 'today' ? 'Out today' : `Released ${when}`) : `${weekday(r.date!)} · ${when}`
}

/** A main or special set, with everything we know about it. */
export function ReleaseCard({ r, today }: { r: DropRelease; today: string }) {
  const stage = releaseStage(r, today)
  const { early, late } = earlyAndLate(r.products, r.date)
  const hasFacts = r.prerelease || r.preorder || r.preorderPrediction || r.pair || r.englishPrediction
  return (
    <Card className="p-4">
      <div className="flex gap-3.5">
        <DateBlock date={r.date} muted={stage === 'out'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-[16.5px] leading-snug font-semibold">{shortName(r.name)}</h3>
            {r.code && <span className="text-[13px] text-ink-3">{r.code}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <RegionBadge region={r.region} />
            <Badge>{KIND_LABEL[r.kind]}</Badge>
            {(r.date || r.confidence === 'low') && <ConfidenceBadge confidence={r.confidence} />}
            {r.origin === 'tcgplayer' && <Badge tone="accent">Detected on TCGplayer</Badge>}
            {stage === 'out' && <Badge tone="good">Out now</Badge>}
            {stage === 'prerelease' && <Badge tone="holo">Prerelease on</Badge>}
          </div>
          <div className="mt-1.5 text-[13px] text-ink-2">
            {countdownText(r, today)}
            {r.dateNote && r.origin === 'seed' ? <span className="text-ink-3"> · {r.dateNote}</span> : null}
            {r.origin === 'tcgplayer' && r.dateNote ? <span className="text-ink-3"> · {r.dateNote}</span> : null}
          </div>
        </div>
      </div>

      {hasFacts && (
        <div className="mt-4 grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
          <PrereleaseFact r={r} today={today} />
          <PreorderFact r={r} today={today} />
          <PairFact r={r} today={today} />
          {early.length > 0 && (
            <Fact icon={<Gift size={16} />} label="Early products">
              {early.map((e) => (
                <div key={e.label}>
                  {bareLabel(e.label)} <span className="text-ink-3">· {shortDate(e.date!)}</span>
                </div>
              ))}
            </Fact>
          )}
          {late.length > 0 && (
            <Fact icon={<Gift size={16} />} label="Rolling out later">
              {late.slice(0, 3).map((e) => (
                <div key={e.label}>
                  {bareLabel(e.label)} <span className="text-ink-3">· {shortDate(e.date!)}</span>
                </div>
              ))}
              {late.length > 3 && <div className="text-ink-3">and {late.length - 3} more</div>}
            </Fact>
          )}
        </div>
      )}

      {r.products.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <div className="pt-1 text-[12.5px] text-ink-3">Products, MSRP and TCGplayer market</div>
          <ProductTable rows={r.products} />
        </div>
      )}

      {r.source && (
        <a href={r.source} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-8 items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
          Source <ExternalLink size={12} aria-hidden />
        </a>
      )}
    </Card>
  )
}

/** One-liner for a smaller product (a tin, a collection box, a deck). */
function ProductLine({ r, today }: { r: DropRelease; today: string }) {
  const p = r.products[0]
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <DateBlock date={r.date} muted={r.date != null && r.date <= today} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] leading-snug font-medium">{shortName(r.name)}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <RegionBadge region={r.region} />
          {(r.date || r.confidence === 'low') && <ConfidenceBadge confidence={r.confidence} />}
          {r.origin === 'tcgplayer' && <Badge tone="accent">Detected on TCGplayer</Badge>}
        </div>
        <div className="mt-1 text-[12.5px] text-ink-3">
          {countdownText(r, today)}
          {p?.msrp != null ? ` · MSRP ${msrpText(p.msrp)}` : ''}
        </div>
      </div>
    </li>
  )
}

export function Timeline({ releases, today }: { releases: DropRelease[]; today: string }) {
  const groups = useMemo(() => groupByMonth(releases), [releases])
  if (!groups.length) return <Empty title="Nothing matches those filters">Try showing rumors or both languages.</Empty>
  return (
    <div className="grid gap-7">
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`m-${g.key}`}>
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <h3 id={`m-${g.key}`} className="text-[15px] font-semibold tracking-tight">
              {g.label}
            </h3>
            <span className="text-[12px] text-ink-3">
              {g.sets.length + g.products.length} {g.sets.length + g.products.length === 1 ? 'release' : 'releases'}
            </span>
          </div>
          <div className="grid gap-3">
            {g.sets.map((r) => (
              <ReleaseCard key={r.id} r={r} today={today} />
            ))}
            {g.products.length > 0 && (
              <Card>
                <div className="border-b border-line px-3.5 py-2 text-[12.5px] text-ink-3">Collections, tins and other products</div>
                <ul className="divide-y divide-line">
                  {g.products.map((r) => (
                    <ProductLine key={r.id} r={r} today={today} />
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
