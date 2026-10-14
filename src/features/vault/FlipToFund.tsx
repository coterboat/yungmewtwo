// Flip to fund: pick something you want (or a dollar amount) and see which of your cards to sell,
// in what order, to pay for it. Estimates only: market isn't a guaranteed sale, fees are rough.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ProductThumb } from '../../components/product.tsx'
import { Badge, Card, Field, Section, Segmented, Select, cx } from '../../components/ui.tsx'
import { PLATFORMS } from '../../lib/fees.ts'
import { money } from '../../lib/format.ts'
import type { VaultRow } from '../../lib/vaultFilter.ts'
import { planFund, rankCandidates, type SellCandidate } from '../../lib/vaultFlip.ts'
import { MoneyInput } from '../tools/bits.tsx'
import { itemName } from './ItemList.tsx'

export function FlipToFund({ held, wants, focusWantId, onFocused }: { held: VaultRow[]; wants: VaultRow[]; focusWantId: string | null; onFocused: () => void }) {
  const [sel, setSel] = useState<string>('')
  const [override, setOverride] = useState('')
  const [platId, setPlatId] = useState<(typeof PLATFORMS)[number]['id']>('tcgplayer')
  const root = useRef<HTMLDivElement>(null)

  const wantRows = useMemo(() => wants.filter((w) => w.valued.market != null), [wants])
  // Default to the most valuable want so the card says something useful at once.
  const selId = sel || (wantRows.length ? [...wantRows].sort((a, b) => (b.valued.value ?? 0) - (a.valued.value ?? 0))[0].item.id : 'custom')
  const want = wantRows.find((w) => w.item.id === selId)

  useEffect(() => {
    if (!focusWantId) return
    setSel(focusWantId)
    setOverride('')
    root.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    onFocused()
  }, [focusWantId, onFocused])

  const derived = want ? (want.valued.market ?? 0) * want.item.qty : 0
  const typed = override.trim() === '' ? null : Number(override)
  const target = typed != null && Number.isFinite(typed) ? typed : derived

  const candidates: SellCandidate[] = useMemo(
    () =>
      held
        .filter((r) => (r.valued.market ?? 0) > 0)
        .map((r) => ({ itemId: r.item.id, productId: r.item.productId, name: itemName(r), qty: r.item.qty, market: r.valued.market as number, cost: r.item.cost ?? null, trade: r.item.status === 'trade' })),
    [held],
  )
  const wantedIds = useMemo(() => new Set(wants.map((w) => w.item.productId)), [wants])
  const ranked = useMemo(() => rankCandidates(candidates, wantedIds), [candidates, wantedIds])
  const plans = useMemo(() => PLATFORMS.map((p) => planFund(ranked, target, p)), [ranked, target])
  const plan = plans.find((p) => p.platform.id === platId) ?? plans[0]
  const byId = new Map(held.map((r) => [r.item.id, r]))
  const label = want ? `${itemName(want)}${want.item.qty > 1 ? ` ×${want.item.qty}` : ''}` : 'your target'

  return (
    <div ref={root}>
      <Section title="Flip to fund" sub="Sell what you hold to pay for what you want" className="!mb-0">
        <Card className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4">
          {!wantRows.length && !held.length ? (
            <p className="text-[13px] text-ink-3">Add a card you want and some you hold, and this ranks what to sell to get it.</p>
          ) : (
            <>
              <Field label="Pay for">
                <Select
                  value={selId}
                  onChange={(e) => {
                    setSel(e.target.value)
                    setOverride('')
                  }}
                >
                  {wantRows.map((w) => (
                    <option key={w.item.id} value={w.item.id}>
                      {itemName(w)} · {money((w.valued.market ?? 0) * w.item.qty)}
                    </option>
                  ))}
                  <option value="custom">A dollar amount</option>
                </Select>
              </Field>
              <MoneyInput label="Amount to cover" value={override !== '' ? override : target ? String(Math.round(target * 100) / 100) : ''} onChange={setOverride} placeholder="0.00" hint={want ? `${itemName(want)} at market. Change it if you'd pay more.` : 'Type what you need to raise'} />
              <div>
                <div className="mb-1.5 text-[13px] font-medium text-ink-2">Sell on</div>
                <Segmented className="w-full [&>button]:min-h-11 [&>button]:flex-1" options={PLATFORMS.map((p) => ({ value: p.id, label: p.id === 'local' ? 'Local' : p.label }))} value={platId} onChange={setPlatId} />
              </div>

              {target > 0 && (
                <>
                  <div className={cx('rounded-xl p-4', plan.covered ? 'bg-accent-soft' : 'bg-surface-2')}>
                    {plan.covered ? (
                      <>
                        <div className="text-[13px] text-ink-2">
                          Sell these {plan.units} on {plan.platform.label}
                        </div>
                        <div className="mt-0.5 text-[17px] leading-snug font-semibold">
                          ~{money(plan.net)} net covers {label} ({money(target)})
                        </div>
                      </>
                    ) : plan.picks.length ? (
                      <>
                        <div className="text-[13px] text-ink-2">Not enough to sell</div>
                        <div className="mt-0.5 text-[15px] leading-snug font-semibold">
                          Everything eligible nets ~{money(plan.net)} on {plan.platform.label}, {money(plan.short)} short of {money(target)}
                        </div>
                      </>
                    ) : (
                      <div className="text-[14px] text-ink-2">Nothing eligible to sell. Cards you also want and anything without a market price are skipped.</div>
                    )}
                    {plan.picks.length > 0 && (
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (plan.net / target) * 100)}%`, background: plan.covered ? 'var(--up)' : 'var(--series-market)' }} />
                      </div>
                    )}
                  </div>

                  {plan.picks.length > 0 && (
                    <ol className="grid grid-cols-[minmax(0,1fr)] gap-1">
                      {plan.picks.map((p, i) => {
                        const row = byId.get(p.cand.itemId)
                        return (
                          <li key={p.cand.itemId}>
                            <a href={`#/item/${p.cand.productId}`} className="flex min-h-12 items-center gap-2.5 rounded-lg px-1 hover:bg-surface-2">
                              <span className="w-4 shrink-0 text-center text-[12px] text-ink-3 tabular">{i + 1}</span>
                              <ProductThumb id={p.cand.productId} kind={row?.product?.kind ?? 'card'} size="sm" className="!w-8" />
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
                                  <span className="truncate">
                                    {p.units > 1 || p.cand.qty > 1 ? `${p.units}× ` : ''}
                                    {p.cand.name}
                                  </span>
                                  {p.cand.trade && <Badge tone="holo" className="!py-0">Trade</Badge>}
                                </span>
                                <span className="block text-[11.5px] text-ink-3 tabular">
                                  {money(p.cand.market)} each{p.cand.qty > p.units ? ` · selling ${p.units} of ${p.cand.qty}` : ''}
                                  {p.cand.cost != null ? ` · paid ${money(p.cand.cost)}` : ''}
                                </span>
                              </span>
                              <span className="shrink-0 text-right">
                                <span className="block text-[13px] font-semibold tabular">{money(p.net)}</span>
                                <span className="block text-[11.5px] text-ink-3 tabular">total {money(p.running)}</span>
                              </span>
                            </a>
                          </li>
                        )
                      })}
                    </ol>
                  )}

                  <div className="grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                    {plans.map((p) => (
                      <button key={p.platform.id} type="button" onClick={() => setPlatId(p.platform.id)} className={cx('rounded-xl border px-2 py-2 text-[12px] transition', p.platform.id === platId ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong')}>
                        <span className="block text-ink-3">{p.platform.id === 'local' ? 'Local' : p.platform.label}</span>
                        <span className="block text-[13px] font-semibold tabular">{p.picks.length ? money(p.net) : '—'}</span>
                        <span className="block text-ink-3">{p.covered ? `${p.units} ${p.units === 1 ? 'card' : 'cards'}` : p.picks.length ? 'short' : 'none'}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p className="text-[12px] leading-relaxed text-ink-3">
                Trade-flagged cards go first, then the biggest gains over what you paid. Cards you also want are skipped. Market price isn't a guaranteed sale, and fees and shipping are estimates; each card is counted as its own sale, so bundling cards would net a bit more.
              </p>
            </>
          )}
        </Card>
      </Section>
    </div>
  )
}
