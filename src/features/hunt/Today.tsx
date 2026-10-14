// "Today": best bets near you, the latest sightings, and what each chain tends to do.
import { Plus, Radio, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { Badge, Button, Card, Empty, Section, cx } from '../../components/ui.tsx'
import { ago } from '../../lib/format.ts'
import { WEEKDAYS_LONG, WEEKDAYS_SHORT, bestDay, chainSummaries, confidence, todaysBets, visitsText, windowLabel, type Bet } from '../../lib/hunt.ts'
import { resultLabel } from '../../lib/huntLog.ts'
import { viewStores } from '../../lib/huntStores.ts'
import { personName } from '../../lib/people.ts'
import { ChainBadge, PersonDot, ResultBadge } from './bits.tsx'
import type { HuntData } from './useHunt.ts'

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** "Good odds" needs either a fresh stocked report or at least 3 visits behind the number. */
function odds(score: number, sample: number, freshStock: boolean): { label: string; tone: 'good' | 'accent' | 'neutral' } {
  if (score >= 0.6 && (freshStock || sample >= 3)) return { label: 'Good odds', tone: 'good' }
  return score >= 0.4 ? { label: 'Maybe', tone: 'accent' } : { label: 'Long shot', tone: 'neutral' }
}

function slotText(b: Bet): string {
  const w = windowLabel(b.slot.weekday, b.slot.block)
  return b.slot.dayOffset === 1 ? `Tomorrow (${w})` : b.slot.now ? `Now (${w})` : `Later today (${w})`
}

function evidence(b: Bet): string {
  const w = windowLabel(b.slot.weekday, b.slot.block)
  if (b.basis === 'store') return `${w}: ${visitsText(b.cell.hits, b.cell.n)} had stock here`
  if (b.basis === 'chain' && b.chainCell) return `${w}: ${visitsText(b.chainCell.hits, b.chainCell.n)} across ${b.store.chain} stores (none logged here in that window yet)`
  return 'No visits logged for this window yet'
}

function BetRow({ bet, data, onOpen, distLabel }: { bet: Bet; data: HuntData; onOpen: (id: string) => void; distLabel?: string }) {
  const sample = bet.basis === 'store' ? bet.cell.n : (bet.chainCell?.n ?? 0)
  const o = odds(bet.score, sample, bet.live?.kind === 'stock')
  const conf = confidence(sample)
  return (
    <Card onClick={() => onOpen(bet.store.id)} className="p-3.5">
      <div className="flex items-start gap-3">
        <ChainBadge chain={bet.store.chain} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="truncate text-[15px] font-semibold">{bet.store.name}</h3>
            <span className="shrink-0 text-[12.5px] text-ink-2 tabular">{distLabel}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={o.tone}>{o.label}</Badge>
            <span className="text-[12.5px] font-medium text-ink-2">{slotText(bet)}</span>
          </div>
          {(bet.basis !== 'prior' || !bet.live) && (
            <p className="mt-1.5 text-[12.5px] text-ink-3">
              {evidence(bet)}
              {bet.basis !== 'prior' && <> · {conf.label.toLowerCase()}</>}
            </p>
          )}
          {bet.live && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
              <Radio size={14} aria-hidden className={bet.live.kind === 'stock' ? 'text-up' : 'text-down'} />
              Seen {resultLabel(bet.live.result).toLowerCase()} {ago(bet.live.at, data.now)} by {personName(data.people, bet.live.by)}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

export function Today({ data, scope, scopeLabel, onOpen, onLog }: { data: HuntData; scope: string; scopeLabel: string; onOpen: (id: string) => void; onLog: () => void }) {
  const views = useMemo(() => viewStores(data.stores, scope), [data.stores, scope])
  const milesOf = useMemo(() => new Map(views.map((v) => [v.store.id, v])), [views])

  const bets = useMemo(
    () =>
      todaysBets(
        views.map((v) => v.store),
        data.sightings,
        data.models,
        data.now,
        (s) => milesOf.get(s.id)?.miles,
      ),
    [views, data.sightings, data.models, data.now, milesOf],
  )
  const signal = bets.filter((b) => b.basis !== 'prior' || b.live)
  const good = signal.filter((b) => b.score >= 0.4).slice(0, 5)

  const feed = useMemo(() => {
    const inScope = new Set(views.map((v) => v.store.id))
    return [...data.sightings]
      .filter((s) => inScope.has(s.store))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, 8)
  }, [views, data.sightings])

  const chains = useMemo(() => chainSummaries(data.stores, data.sightings, data.models), [data.stores, data.sightings, data.models])
  const total = data.sightings.length

  return (
    <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div>
        <Section title="Today's best bets" sub={`${scopeLabel}. Ranked by what your own log says about today, and fresh sightings count most.`}>
          {good.length > 0 ? (
            <div className="grid grid-cols-1 gap-2.5">
              {good.map((b) => {
                const v = milesOf.get(b.store.id)
                return <BetRow key={b.store.id} bet={b} data={data} onOpen={onOpen} distLabel={v?.miles != null ? `${v.miles.toFixed(1)} mi${v.whose ? ` · ${personName(data.people, v.whose)}` : ''}` : undefined} />
              })}
              <p className="text-[12px] text-ink-3">These are odds from a small log, not promises. "Hunch" and "early read" mean only a few visits behind it.</p>
            </div>
          ) : signal.length > 0 ? (
            <Empty icon={<Sparkles size={20} />} title="Nothing stands out right now">
              Based on {total} {total === 1 ? 'sighting' : 'sightings'} so far, no store near you looks better than a coin flip for the rest of today. Check one anyway and log what you find.
            </Empty>
          ) : (
            <Empty
              icon={<Sparkles size={20} />}
              title="No pattern yet"
              action={
                <Button variant="primary" onClick={onLog}>
                  <Plus size={18} aria-hidden /> Log your first sighting
                </Button>
              }
            >
              Log a few visits; patterns need about 3 sightings per store. Chain-wide patterns show up sooner, so even stops at different Targets count.
            </Empty>
          )}
        </Section>

        <Section title="Latest sightings" sub="What the two of you saw most recently.">
          {feed.length === 0 ? (
            <p className="text-sm text-ink-2">Nothing logged near {scopeLabel.toLowerCase().replace(/^near /, '')} yet.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {feed.map((s) => {
                const store = data.storeById.get(s.store)
                if (!store) return null
                const who = data.people.find((p) => p.id === s.by)
                return (
                  <li key={s.id}>
                    <Card onClick={() => onOpen(store.id)} className="flex items-center gap-3 p-3">
                      <ChainBadge chain={store.chain} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium">{store.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
                          <ResultBadge result={s.result} />
                          <span>{ago(s.at, data.now)}</span>
                          <span className="inline-flex items-center gap-1">
                            <PersonDot person={who} /> {personName(data.people, s.by)}
                          </span>
                          {s.items?.length ? <span className="truncate text-ink-2">{s.items.join(', ')}</span> : null}
                        </div>
                      </div>
                    </Card>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
      </div>

      <div>
        <Section title="Chain patterns" sub="Across every store you've logged, so it fills in before any one store does. Early reads, not rules.">
          {chains.length === 0 ? (
            <Empty title="Nothing to compare yet">Once you've logged a few stops, you'll see which weekdays each chain tends to have stock.</Empty>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {chains.slice(0, 6).map((c) => {
                const top = bestDay(c.grid, 3)
                const conf = confidence(c.n)
                const max = Math.max(1, ...c.grid.weekdays.map((w) => w.n))
                return (
                  <Card key={c.chain} className="p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <ChainBadge chain={c.chain} size="sm" />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[15px] font-semibold">{c.chain}</h3>
                        <p className="text-[12px] text-ink-3">
                          {c.n} {c.n === 1 ? 'sighting' : 'sightings'} at {c.stores} {c.stores === 1 ? 'store' : 'stores'}
                        </p>
                      </div>
                      <Badge tone={conf.level === 'fair' || conf.level === 'solid' ? 'good' : 'neutral'}>{conf.label}</Badge>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5" role="img" aria-label={`${c.chain} stock by weekday: ${WEEK_ORDER.map((d) => `${WEEKDAYS_LONG[d]} ${c.grid.weekdays[d].hits} of ${c.grid.weekdays[d].n}`).join(', ')}`}>
                      {WEEK_ORDER.map((d) => {
                        const w = c.grid.weekdays[d]
                        const h = w.n === 0 ? 0 : Math.max(4, Math.round((w.hits / w.n) * 44))
                        return (
                          <div key={d} className="flex flex-col items-center gap-1">
                            <div className="flex h-11 w-full items-end">
                              {w.n === 0 ? (
                                <div className="h-px w-full border-t border-dashed border-line-strong" />
                              ) : (
                                <div className={cx('w-full rounded-t-md', w.hits === 0 ? 'bg-surface-3' : 'bg-accent')} style={{ height: h, opacity: 0.45 + 0.55 * Math.min(1, w.n / max) }} />
                              )}
                            </div>
                            <span className="text-[11px] font-medium text-ink-2 tabular">{w.n === 0 ? '·' : `${w.hits}/${w.n}`}</span>
                            <span className="text-[11px] text-ink-3">{WEEKDAYS_SHORT[d]}</span>
                          </div>
                        )
                      })}
                    </div>
                    <p className="mt-3 text-[12.5px] text-ink-2">
                      {top ? (
                        <>
                          <span className="font-medium">{top.label} lead:</span> {visitsText(top.hits, top.n)} had stock{top.n < 3 ? ' (a hunch so far)' : ''}.
                        </>
                      ) : (
                        'No weekday stands out yet.'
                      )}
                    </p>
                  </Card>
                )
              })}
              <p className="text-[12px] text-ink-3">Bar height is the share of that weekday's visits that found stock; fainter bars rest on fewer visits. The numbers are stocked visits / visits.</p>
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

