// Open vs sealed: what a sealed product is worth if you rip it, from community pull rates and the
// set's card prices, with a Monte Carlo to show how lopsided the outcomes are. Average (EV) and
// typical (median) are very different numbers for a lottery, and the median is the one you live.
import { AlertTriangle, Dices, ExternalLink, PackageOpen, Package, Scale } from 'lucide-react'
import { useMemo } from 'react'
import { Badge, Button, Card, Chips, Section, Toggle } from '../../components/ui.tsx'
import { setLabel } from '../../components/product.tsx'
import { useData, useProduct, useSealed, useSetProducts, useSets } from '../../lib/data.ts'
import { PLATFORMS, netProceeds } from '../../lib/fees.ts'
import { money } from '../../lib/format.ts'
import { SKIP_LABEL, buildTiers, eraDefaults, eraOf, findPullRates, hasRates, openEv, openVerdict, type OpenVerdictKind, type PullRateFile, type PullRates } from '../../lib/ev.ts'
import { chaseTiers, simulate } from '../../lib/evSim.ts'
import { expectOneText, ofHundred, outOf100Text, sealedUnit } from '../../lib/evOdds.ts'
import { quoteFor } from '../../lib/vault.ts'
import { Histogram, type Marker } from './Histogram.tsx'
import { MoneyInput, Note, ProductField, useQ } from './bits.tsx'

/** Rough value of the commons, uncommons and reverse holos in a pack. Not from pull rates: edit it. */
const DEFAULT_BULK = 0.25
const RUNS = 5000

const VERDICT_ICON: Record<OpenVerdictKind, typeof Package> = { sealed: Package, open: PackageOpen, gamble: Dices, 'toss-up': Scale, unknown: Package }
const CONF_LABEL = { high: 'High confidence', med: 'Medium confidence', low: 'Low confidence' } as const

const share = (p: number) => (p < 0.1 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`)

function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s;,)]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 break-all text-accent underline-offset-2 hover:underline">
        {part.replace(/^https?:\/\/(www\.)?/, '').slice(0, 44)}
        <ExternalLink size={11} aria-hidden />
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

export default function EvTool() {
  const q = useQ()
  const productId = q.num('product') ?? null
  const { data: loaded, loading: productLoading } = useProduct(productId)
  const product = productId ? loaded : undefined
  const { data: sets } = useSets()
  const { data: file } = useData<PullRateFile>('seed/pullrates.json')
  const { data: sealedRows } = useSealed()
  const set = product && sets ? sets.find((s) => s.id === product.set) : undefined
  const { data: cards } = useSetProducts(set?.lang === 'EN' ? set.id : null)

  const countFees = q.get('fees') === '1'
  const useDefaults = q.get('defaults') === '1'
  const bulk = q.num('bulk') ?? DEFAULT_BULK
  const packs = Math.min(2000, Math.round(q.num('packs') ?? product?.packs ?? 0))
  const sealedMarket = quoteFor(product)?.market ?? null
  const paidDefault = product?.msrp ?? sealedMarket ?? null
  const paid = q.num('paid') ?? paidDefault
  const msrp = product?.msrp ?? null

  const found = useMemo(() => (set && file ? findPullRates(file, set) : undefined), [set, file])
  const measured = found && hasRates(found.rates) ? found.rates : undefined
  const era = set ? eraOf(set.name) : null
  const defaults = useMemo(() => (!measured && file && sets && era ? eraDefaults(file, sets, era) : undefined), [measured, file, sets, era])
  const rates: PullRates | undefined = measured ?? (useDefaults ? defaults : undefined)

  const built = useMemo(() => {
    if (!rates || !cards) return undefined
    return buildTiers(rates, cards, countFees ? (p) => netProceeds(p, PLATFORMS[0]) : undefined)
  }, [rates, cards, countFees])
  const ev = built && packs > 0 ? openEv(built.tiers, packs, bulk) : undefined
  const sim = useMemo(
    () => (built && built.tiers.length && packs > 0 ? simulate({ tiers: built.tiers.map((t) => ({ rarity: t.rarity, p: t.p, values: t.cards.map((c) => c.price) })), packs, bulkPerPack: bulk, runs: RUNS, seed: productId ?? 1 }) : undefined),
    [built, packs, bulk, productId],
  )

  const sealedValue = sealedMarket == null ? null : countFees ? netProceeds(sealedMarket, PLATFORMS[0]) : sealedMarket
  const verdict = ev && sim ? openVerdict({ ev: ev.total, median: sim.median, sealed: sealedValue }) : undefined
  const Icon = verdict ? VERDICT_ICON[verdict.verdict] : Package

  // Sealed products from sets that have pull rates, to try with one tap.
  const suggestions = useMemo(() => {
    if (!file || !sealedRows || !sets) return []
    const withRates = new Set(Object.values(file).filter((r) => r.tcgGroupId != null && hasRates(r)).map((r) => r.tcgGroupId))
    const setById = new Map(sets.map((s) => [s.id, s]))
    return sealedRows
      .filter((r) => r.lang === 'EN' && withRates.has(r.set) && ['booster-box', 'etb', 'bundle'].includes(r.sealed) && (r.market ?? 0) > 0 && !r.presale)
      .sort((a, b) => (b.released ?? '').localeCompare(a.released ?? '') || (b.market ?? 0) - (a.market ?? 0))
      .filter((r, i, all) => all.findIndex((o) => o.set === r.set && o.sealed === r.sealed) === i)
      .slice(0, 6)
      .map((r) => ({ value: String(r.id), label: `${setLabel(setById.get(r.set))} ${r.sealed === 'booster-box' ? 'box' : r.sealed === 'etb' ? 'ETB' : 'bundle'}` }))
  }, [file, sealedRows, sets])

  const chase = built ? chaseTiers(built.tiers.map((t) => t.rarity), Object.fromEntries(built.tiers.map((t) => [t.rarity, t.perPack]))) : []
  const sources = built ? [...new Set(built.tiers.map((t) => t.source).filter((s): s is string => !!s))] : []
  const maxTierEv = built ? Math.max(...built.tiers.map((t) => t.evPerPack), bulk, 0.0001) : 1
  const sortedTiers = built ? [...built.tiers].sort((a, b) => b.evPerPack - a.evPerPack) : []
  const wrongKind = product && product.kind !== 'sealed'
  const jp = set?.lang === 'JP'
  const noCards = !!cards && !cards.some((c) => c.kind === 'card')
  const detailsStillLoading = !!product && !!set && set.lang === 'EN' && !cards
  const packsInfo = product?.packs ? `${product.packs} in this product` : 'Count the packs inside'
  const packsOnly = product?.sealed && !['booster-box', 'half-box', 'bundle', 'pack', 'sleeved-pack', 'case'].includes(product.sealed)

  const unit = sealedUnit(product?.sealed)
  const markers: Marker[] = []
  if (sim) {
    markers.push({ key: 'median', label: 'Typical box (median)', value: sim.median, color: 'var(--text-1)' })
    markers.push({ key: 'mean', label: 'Average (EV)', value: ev?.total ?? sim.mean, color: 'var(--series-3)', dash: '6 4' })
    if (paid != null) markers.push({ key: 'paid', label: 'Price paid', value: paid, color: 'var(--series-low)', dash: '2 4' })
  }
  const skewed = sim && ev && sim.median < ev.total * 0.75

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_1fr]">
      {/* Inputs */}
      <Card className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 lg:col-start-1 lg:row-start-1 lg:self-start">
        <ProductField id={productId} onPick={(id) => q.set({ product: id, packs: null, paid: null })} onClear={() => q.set({ product: null, packs: null, paid: null })} label="Sealed product" kind="s" empty="Pick a box, ETB, bundle or pack" />
        {!productId && suggestions.length > 0 && (
          <div>
            <div className="mb-1.5 text-[12px] text-ink-3">Try one</div>
            <Chips options={suggestions} value="" onChange={(v) => q.set({ product: v })} />
          </div>
        )}
        {product && !wrongKind && (
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput label="Packs inside" prefix="×" {...q.field('packs', product.packs ?? '')} hint={packsInfo} />
            <MoneyInput label="Price paid" {...q.field('paid', paidDefault != null ? Math.round(paidDefault * 100) / 100 : '')} hint={msrp ? `MSRP ${money(msrp)}` : 'For the odds of profit'} />
          </div>
        )}
      </Card>

      {/* Results */}
      <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        {!productId && (
          <Card className="p-5 text-sm text-ink-2">
            <div className="mb-1 font-semibold text-ink">Should you open it or keep it sealed?</div>
            Pick a sealed product. Using community pull rates and today's card prices, you'll see what a pack is worth on average, what a typical box actually returns, and the odds you come out ahead.
          </Card>
        )}
        {productId && !product && <Card className="p-5 text-sm text-ink-3">{productLoading || !sets || !file ? 'Loading…' : "Couldn't find that product."}</Card>}
        {wrongKind && <Card className="p-5 text-sm text-ink-2">That's a single card. Pick a sealed product (a box, ETB, bundle or pack) to see what opening it is worth.</Card>}
        {product && !wrongKind && jp && (
          <Card className="p-5 text-sm text-ink-2">
            <div className="mb-1 font-semibold text-ink">English sets only</div>
            Pull rates here are for English packs. Japanese packs have different slots and odds.
          </Card>
        )}
        {product && !wrongKind && !jp && detailsStillLoading && <Card className="p-5 text-sm text-ink-3">Loading card prices…</Card>}

        {product && !wrongKind && !jp && set && file && !rates && (
          <Card className="grid grid-cols-[minmax(0,1fr)] gap-3 p-5">
            <div className="font-semibold">No pull rates for {setLabel(set)} yet</div>
            <p className="text-sm text-ink-2">
              {found && !found.rates.tiers.length ? 'The set is too new for anyone to have opened enough packs to measure it.' : "We don't have community pull-rate data for this set."}{' '}
              {noCards
                ? "The set's card list isn't in the price data yet, so there are no hit cards to value even with stand-in odds. Check back once it's out."
                : defaults
                ? `As a stand-in you can use the median rates across ${defaults.derivedFrom?.length ?? 0} other ${era}-era sets. That's a rough guess, not this set's real odds.`
                : 'There are no nearby sets with data to borrow from, so there is nothing to estimate with.'}
            </p>
            {defaults && !noCards && (
              <div>
                <Button variant="primary" onClick={() => q.set({ defaults: '1' })}>
                  Use {era}-era defaults (estimate)
                </Button>
              </div>
            )}
            {sealedMarket != null && <p className="text-sm text-ink-3">Sealed market today: {money(sealedMarket)}.</p>}
          </Card>
        )}

        {product && !wrongKind && rates && built && !packs && (
          <Card className="p-5 text-sm text-ink-2">
            <div className="mb-1 font-semibold text-ink">How many packs are inside?</div>
            We couldn't tell from the product. Enter the pack count above.
          </Card>
        )}
        {product && !wrongKind && built && packs > 0 && !built.tiers.length && (
          <Card className="p-5 text-sm text-ink-2">
            <div className="mb-1 font-semibold text-ink">No hit cards to value</div>
            {noCards ? "The set's card list isn't in the price data yet. Check back once it's out." : "None of this set's pull-rate tiers match cards in the catalog, so there's nothing to add up."}
          </Card>
        )}

        {ev && sim && verdict && built && (
          <>
            <Card className="fade-in p-5 sm:p-6">
              <Badge tone={verdict.verdict === 'open' ? 'good' : verdict.verdict === 'gamble' ? 'warning' : 'neutral'} icon={<Icon size={13} aria-hidden />}>
                {packs} packs{countFees ? ' · after fees' : ''}
                {!measured && ' · estimated rates'}
              </Badge>
              <div className="mt-3 text-4xl font-extrabold tracking-tight">{verdict.headline}</div>
              <p className="mt-2 max-w-lg text-[15px] text-ink-2">
                {sealedValue != null ? (
                  <>
                    {verdict.verdict === 'sealed' && <>Sealed {money(sealedValue)} vs open ~{money(ev.total)}. Opening is expected to lose about {money(sealedValue - ev.total)}.</>}
                    {verdict.verdict === 'open' && <>Sealed {money(sealedValue)} vs open ~{money(ev.total)}, and the typical box ({money(sim.median)}) holds up too.</>}
                    {verdict.verdict === 'gamble' && <>Sealed {money(sealedValue)} vs open ~{money(ev.total)} on average, but the typical box returns only {money(sim.median)}. Big hits carry the average.</>}
                    {verdict.verdict === 'toss-up' && <>Sealed {money(sealedValue)} vs open ~{money(ev.total)}. Close enough that fees and luck decide it.</>}
                  </>
                ) : (
                  <>There's no sealed price to compare against. Opening is worth ~{money(ev.total)} on average; the typical box returns {money(sim.median)}.</>
                )}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
                <div>
                  <div className="text-[12px] text-ink-3">Sealed {countFees ? '(net)' : 'market'}</div>
                  <div className="text-lg font-semibold tabular">{money(sealedValue)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-ink-3">Open, average</div>
                  <div className="text-lg font-semibold tabular">{money(ev.total)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-ink-3">Open, typical</div>
                  <div className="text-lg font-semibold tabular">{money(sim.median)}</div>
                </div>
              </div>
              {msrp != null && msrp > 0 && (
                <p className="mt-3 text-[13px] text-ink-2">
                  Against MSRP ({money(msrp)}) opening returns {Math.round((ev.total / msrp) * 100)}% on average and {Math.round((sim.median / msrp) * 100)}% for the typical box.
                </p>
              )}
            </Card>

            {skewed && (
              <Card className="flex gap-3 p-4">
                <Dices size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <p className="text-[14px] text-ink-2">
                  <b className="text-ink">EV says {money(ev.total)}, but the typical box is {money(sim.median)}.</b> The average is pulled up by a few big hits. Half of simulated products returned less than {money(sim.median)}.
                </p>
              </Card>
            )}

            <Section title="How boxes actually turn out" sub={`${RUNS.toLocaleString()} simulated ${packs}-pack products`} className="!mb-0">
              <Card className="p-4">
                <Histogram
                  values={sim.values}
                  markers={markers}
                  paid={paid}
                  ariaLabel={`Distribution of ${RUNS} simulated outcomes. Typical ${money(sim.median)}, average ${money(ev.total)}, worst tenth up to ${money(sim.p10)}, best tenth from ${money(sim.p90)}.`}
                />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
                  {markers.map((m) => (
                    <span key={m.key} className="inline-flex items-center gap-1.5">
                      <svg width="22" height="6" aria-hidden>
                        <line x1="0" x2="22" y1="3" y2="3" stroke={m.color} strokeWidth={2} strokeDasharray={m.dash} />
                      </svg>
                      {m.label} <span className="tabular text-ink-3">{money(m.value)}</span>
                    </span>
                  ))}
                </div>
                {paid != null && <p className="mt-1.5 text-[12px] text-ink-3">Bars right of the price-paid line are runs where you come out ahead; the rest are dimmed.</p>}
                {(paid != null || sealedValue != null) && (
                  <p className="mt-4 border-t border-line pt-4 text-[14px] font-medium">
                    {outOf100Text(sim.probAbove((paid ?? sealedValue) as number), unit)}
                    <span className="font-normal text-ink-2"> {paid != null ? `(they return less than the ${money(paid)} you paid)` : '(they return less than selling sealed)'}.</span>
                  </p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 pt-1">
                  <div className="col-span-2">
                    <div className="text-[12px] text-ink-3">The middle 80% of products returned</div>
                    <div className="text-xl font-bold tabular">
                      {money(sim.p10)} – {money(sim.p90)}
                    </div>
                  </div>
                  {paid != null && (
                    <div>
                      <div className="text-[12px] text-ink-3">Beat what you paid ({money(paid)})</div>
                      <div className="text-2xl font-bold tabular">{share(sim.probAbove(paid))}</div>
                    </div>
                  )}
                  {sealedValue != null && (
                    <div>
                      <div className="text-[12px] text-ink-3">Beat selling sealed ({money(sealedValue)})</div>
                      <div className="text-2xl font-bold tabular">{share(sim.probAbove(sealedValue))}</div>
                    </div>
                  )}
                  {chase.map((r) => (
                    <div key={r}>
                      <div className="text-[12px] text-ink-3">At least one {r}</div>
                      <div className="text-2xl font-bold tabular">{share(sim.atLeastOne[r] ?? 0)}</div>
                      <div className="text-[12px] text-ink-3 tabular">
                        {ofHundred(sim.atLeastOne[r] ?? 0)} of 100 {unit.many}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </Section>

            <Section title="Where the value comes from" sub={`Average per pack: ${money(ev.perPack)} (hits ${money(ev.hitPerPack)} + bulk ${money(ev.bulkPerPack)})`} className="!mb-0">
              <Card className="divide-y divide-line">
                {sortedTiers.map((t) => (
                  <div key={t.rarity} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0 text-[14px] font-medium">{t.rarity}</div>
                      <div className="shrink-0 text-[14px] font-semibold tabular">
                        {money(t.evPerPack)}
                        <span className="text-[11px] font-normal text-ink-3"> / pack</span>
                      </div>
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-3 tabular">
                      1 in {t.perPack >= 10 ? Math.round(t.perPack) : t.perPack} packs{packs > 0 && t.perPack >= packs * 0.85 ? `, ${expectOneText(t.perPack, packs, unit)}` : ''}
                    </div>
                    <div className="text-[12px] text-ink-3 tabular">
                      {t.pricedCount === t.total ? `${t.total} cards` : `${t.pricedCount} of ${t.total} priced`} · avg {money(t.avg)}
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <div className="h-full rounded-full" style={{ width: `${Math.max(2, (t.evPerPack / maxTierEv) * 100)}%`, background: 'var(--series-market)' }} />
                    </div>
                  </div>
                ))}
                <div className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-[14px] font-medium">
                      Bulk and reverse holos <Badge className="ml-1">Estimate</Badge>
                    </div>
                    <div className="shrink-0 text-[14px] font-semibold tabular">
                      {money(bulk)}
                      <span className="text-[11px] font-normal text-ink-3"> / pack</span>
                    </div>
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-3">A flat allowance you can change. It isn't from pull rates, and most commons and uncommons aren't worth selling one by one.</div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, (bulk / maxTierEv) * 100)}%`, background: 'var(--text-3)' }} />
                  </div>
                </div>
              </Card>
              <Note>
                {packsOnly ? 'Counts the booster packs only: promo cards, sleeves, dice and the box itself are not valued. ' : ''}
                Averages use the most valuable printing of every card of that rarity in the set, at TCGplayer market price; unpriced cards are left out. Hits are drawn independently per pack. EV is an estimate from sampled packs, market price is not a guaranteed sale, and your boxes will vary.
              </Note>
            </Section>
          </>
        )}
      </div>

      {/* Assumptions */}
      {product && !wrongKind && (
        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-4 lg:col-start-1 lg:row-start-2">
          <Card className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4">
            <div className="text-[14px] font-semibold">Assumptions</div>
            <MoneyInput label="Bulk per pack" {...q.field('bulk', DEFAULT_BULK)} hint="Estimate for commons, uncommons and reverse holos. Not from pull rates." />
            <Toggle
              checked={countFees}
              onChange={(v) => q.set({ fees: v ? '1' : null })}
              label={
                <span>
                  Count selling fees<span className="block text-[12px] text-ink-3">Nets each card and the sealed box after TCGplayer fees</span>
                </span>
              }
            />
          </Card>

          {rates && built && (
            <Card className="grid grid-cols-[minmax(0,1fr)] gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[14px] font-semibold">Pull rates</div>
                {measured && rates.confidence && <Badge tone={rates.confidence === 'high' ? 'good' : rates.confidence === 'med' ? 'neutral' : 'warning'}>{CONF_LABEL[rates.confidence]}</Badge>}
                {!measured && (
                  <Badge tone="warning" icon={<AlertTriangle size={12} aria-hidden />}>
                    Estimated defaults
                  </Badge>
                )}
              </div>
              <p className="text-[13px] text-ink-2">{rates.name}</p>
              {rates.note && <p className="text-[12px] leading-relaxed text-ink-3">{rates.note}</p>}
              {measured && sources.length > 0 && (
                <details className="text-[12px] text-ink-3">
                  <summary className="min-h-9 cursor-pointer py-2 text-ink-2">Sources ({sources.length})</summary>
                  <ul className="mt-1 grid grid-cols-[minmax(0,1fr)] gap-1.5">
                    {sources.map((s) => (
                      <li key={s} className="leading-relaxed">
                        {linkify(s)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {built.skipped.length > 0 && (
                <p className="text-[12px] text-ink-3">
                  Not counted: {built.skipped.map((s) => `${s.rarity} (${SKIP_LABEL[s.reason]})`).join('; ')}. The bulk allowance partly stands in for them.
                </p>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
