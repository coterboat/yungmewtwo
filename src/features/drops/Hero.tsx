import { CalendarClock, Gift } from 'lucide-react'
import { Badge, Card, Delta, Money } from '../../components/ui.tsx'
import { earlyAndLate, headlineRows, releaseStage, shortName, type DropRelease } from '../../lib/drops.ts'
import { shortDate, weekday } from '../../lib/format.ts'
import { ConfidenceBadge, Fact } from './bits.tsx'
import { bareLabel, msrpText } from './util.ts'
import { PairFact, PreorderFact, PrereleaseFact } from './facts.tsx'
import { localToday, useNow } from './hooks.ts'

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }
}

function Digit({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl border border-line bg-surface-2/80 px-2 py-2.5 text-center sm:flex-none sm:px-5">
      <div className="tabular text-[28px] leading-none font-bold tracking-tight sm:text-[40px]">{String(value).padStart(2, '0')}</div>
      <div className="mt-1.5 text-[11.5px] text-ink-3">{label}</div>
    </div>
  )
}

/** The next English release, with a live countdown to midnight of the day it comes out. */
export function Hero({ release: r }: { release: DropRelease }) {
  const now = useNow(1000)
  const today = localToday(now)
  const stage = releaseStage(r, today)
  const target = new Date(`${r.date}T00:00:00`).getTime()
  const left = target - now
  const t = parts(left)
  const { early } = earlyAndLate(r.products, r.date)
  const key = headlineRows(r.products)
  const anyPresale = key.some((k) => k.tcg?.presale)

  return (
    <Card holo className="bg-[radial-gradient(120%_90%_at_100%_0%,var(--accent-soft),transparent_65%)] p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
        <CalendarClock size={16} className="text-accent" aria-hidden />
        <span>Next English release</span>
        {stage === 'prerelease' && <Badge tone="holo">Prerelease events are on</Badge>}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[26px] leading-tight font-bold tracking-tight sm:text-4xl">{shortName(r.name)}</h2>
        {r.code && <span className="text-[15px] font-medium text-ink-3">{r.code}</span>}
        <ConfidenceBadge confidence={r.confidence} />
      </div>
      <p className="mt-1 text-[14px] text-ink-2">
        {weekday(r.date!)}, {shortDate(r.date!)}
        {r.dateNote ? <span className="text-ink-3"> · {r.dateNote}</span> : null}
      </p>

      {left > 0 ? (
        <div className="mt-5 flex max-w-xl gap-2 sm:gap-3" role="timer" aria-label={`${t.d} days ${t.h} hours until release`}>
          <Digit value={t.d} label={t.d === 1 ? 'day' : 'days'} />
          <Digit value={t.h} label="hours" />
          <Digit value={t.m} label="min" />
          <Digit value={t.s} label="sec" />
        </div>
      ) : (
        <p className="mt-5 text-xl font-semibold">Out now</p>
      )}

      <div className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <PrereleaseFact r={r} today={today} />
        <PreorderFact r={r} today={today} />
        {early.length > 0 && (
          <Fact icon={<Gift size={16} />} label="Early products">
            {early.map((e) => (
              <div key={e.label}>
                {bareLabel(e.label)} <span className="text-ink-3">· {shortDate(e.date!)}</span>
              </div>
            ))}
          </Fact>
        )}
        <PairFact r={r} today={today} />
      </div>

      {key.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <div className="mb-2 text-[12.5px] text-ink-3">{anyPresale ? 'Pre-sale prices on TCGplayer right now' : 'TCGplayer market right now'}</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {key.map((k) => (
              <div key={k.label} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5 sm:block">
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-ink-2">{bareLabel(k.label)}</div>
                  <div className="text-[12px] text-ink-3 sm:mt-1">{k.msrp != null ? `MSRP ${msrpText(k.msrp)}` : 'MSRP unknown'}</div>
                </div>
                <div className="text-right sm:mt-0.5 sm:text-left">
                  <Money value={k.tcg!.market} className="text-xl font-semibold" />
                  {k.premium != null && (
                    <div className="text-[12px] text-ink-3">
                      <Delta value={k.premium} digits={0} /> {k.tcg!.presale ? 'pre-order premium' : 'over MSRP'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
