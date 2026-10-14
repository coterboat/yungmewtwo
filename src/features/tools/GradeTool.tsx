// Grading: is a raw card worth sending in, or should it be sold raw? Expected value over grade
// odds, after selling fees and the full cost of grading, with the PSA 10 price that breaks even.
import { Check, ExternalLink, Info, Minus, X } from 'lucide-react'
import { Badge, Card, Chips, Section, Segmented, cx } from '../../components/ui.tsx'
import { useProduct } from '../../lib/data.ts'
import { PLATFORMS } from '../../lib/fees.ts'
import { money, pct } from '../../lib/format.ts'
import { GRADING_FACTS_AS_OF, GRADING_SERVICES, breakEvenByBatch, ebaySoldUrl, evaluateGrading, gradeQuery, serviceById, type GradeVerdict } from '../../lib/grading.ts'
import { quoteFor } from '../../lib/vault.ts'
import { Line, MoneyInput, Note, ProductField, VariantSelect, signedMoney, toneText, useQ } from './bits.tsx'

const VERDICT: Record<GradeVerdict, { title: string; tone: 'good' | 'neutral' | 'critical'; icon: typeof Check }> = {
  worth: { title: 'Worth grading', tone: 'good', icon: Check },
  marginal: { title: 'Marginal', tone: 'neutral', icon: Minus },
  raw: { title: 'Sell raw', tone: 'critical', icon: X },
}

const DEFAULT_P10 = 25
const DEFAULT_P9 = 50

export default function GradeTool() {
  const q = useQ()
  const productId = q.num('product') ?? null
  const { data: loaded } = useProduct(productId)
  const product = productId ? loaded : undefined
  const quote = quoteFor(product, q.get('variant') || undefined)
  const market = quote?.market ?? null

  const service = serviceById(q.get('svc') || 'psa-regular')
  const platId = (PLATFORMS.find((p) => p.id === q.get('plat'))?.id ?? 'ebay') as (typeof PLATFORMS)[number]['id']
  const platform = PLATFORMS.find((p) => p.id === platId) ?? PLATFORMS[1]

  const raw = q.num('raw') ?? market ?? undefined
  const g10 = q.num('g10')
  const g9 = q.num('g9')
  const g8 = q.num('g8')
  const p10 = q.num('p10') ?? DEFAULT_P10
  const p9 = Math.min(q.num('p9') ?? DEFAULT_P9, Math.max(0, 100 - p10))
  const fee = q.num('fee') ?? service.fee
  const mem = q.num('mem') ?? service.membership
  const out = q.num('out') ?? 10
  const back = q.num('back') ?? 15
  const batch = Math.max(1, Math.round(q.num('batch') ?? 1))

  const ready = raw != null && raw > 0 && g10 != null && g9 != null && g8 != null
  const inputs = ready ? { raw: raw as number, price10: g10 as number, price9: g9 as number, price8: g8 as number, p10: p10 / 100, p9: p9 / 100, fee, shipOut: out, shipBack: back, membership: mem, batch, platform } : null
  const result = inputs ? evaluateGrading(inputs) : null
  const sensitivity = inputs ? breakEvenByBatch(inputs, [1, 5, 10, 20]) : []
  const V = result ? VERDICT[result.verdict] : null
  const searchName = product?.name

  const fillGuess = () => {
    if (raw == null) return
    q.set({ g10: Math.round(raw * 3), g9: Math.round(raw * 1.4), g8: Math.round(raw * 0.9) })
  }

  const setService = (id: string) => q.set({ svc: id === 'psa-regular' ? null : id, fee: null, mem: null })

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <Card className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4">
          <ProductField id={productId} onPick={(id) => q.set({ product: id, variant: null, raw: null })} onClear={() => q.set({ product: null, variant: null })} label="Which card? (optional)" empty="Pick a card to fill in its raw price" kind="c" />
          <VariantSelect product={product} value={q.get('variant')} onChange={(v) => q.set({ variant: v, raw: null })} />
          <MoneyInput label="Raw value" value={q.get('raw')} onChange={(v) => q.set({ raw: v })} placeholder={market ? market.toFixed(2) : '0.00'} hint={market && q.num('raw') == null ? `Using market ${money(market)}` : 'What it sells for ungraded'} />
        </Card>

        <Card className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4">
          <div>
            <div className="text-[14px] font-semibold">What slabbed copies sell for</div>
            <p className="mt-0.5 text-[12px] text-ink-3">Your best read of recent sales, in the same condition and edition. Type them in; do not trust a guess.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MoneyInput label="PSA 10" value={q.get('g10')} onChange={(v) => q.set({ g10: v })} placeholder="0" />
            <MoneyInput label="PSA 9" value={q.get('g9')} onChange={(v) => q.set({ g9: v })} placeholder="0" />
            <MoneyInput label="8 or lower" value={q.get('g8')} onChange={(v) => q.set({ g8: v })} placeholder="0" />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            {searchName ? (
              <>
                <a className="inline-flex min-h-9 items-center gap-1 text-accent underline-offset-2 hover:underline" href={ebaySoldUrl(gradeQuery(searchName, 10))} target="_blank" rel="noreferrer noopener">
                  PSA 10 sold on eBay <ExternalLink size={13} aria-hidden />
                </a>
                <a className="inline-flex min-h-9 items-center gap-1 text-accent underline-offset-2 hover:underline" href={ebaySoldUrl(gradeQuery(searchName, 9))} target="_blank" rel="noreferrer noopener">
                  PSA 9 sold on eBay <ExternalLink size={13} aria-hidden />
                </a>
              </>
            ) : (
              <span className="text-ink-3">Pick the card above for one-tap eBay sold searches.</span>
            )}
            {raw != null && raw > 0 && (
              <button type="button" onClick={fillGuess} className="inline-flex min-h-9 items-center text-ink-3 underline underline-offset-2 hover:text-ink">
                Fill placeholder guesses
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MoneyInput label="Chance of 10" prefix="" suffix="%" {...q.field('p10', DEFAULT_P10)} />
            <MoneyInput label="Chance of 9" prefix="" suffix="%" {...q.field('p9', DEFAULT_P9)} />
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-2">8 or lower</div>
              <div className="flex min-h-11 items-center rounded-xl border border-line px-3 text-[15px] text-ink-2 tabular">{Math.max(0, 100 - p10 - p9).toFixed(0)}%</div>
            </div>
          </div>
          <Note>Odds are yours to set. Clean, well-centered modern cards grade 10 more often; older or played ones much less.</Note>
        </Card>

        <Card className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4">
          <div>
            <div className="text-[14px] font-semibold">Grading service</div>
            <p className="mt-0.5 text-[12px] text-ink-3">Fees and turnarounds as of {GRADING_FACTS_AS_OF}. They change often, so check the grader's site before you send.</p>
          </div>
          <Chips options={GRADING_SERVICES.filter((s) => !s.unavailable).map((s) => ({ value: s.id, label: s.label }))} value={service.id} onChange={setService} />
          <div className="rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <b className="text-ink">{money(service.fee)}</b> a card
              <span className="text-ink-3">·</span>
              <span>wait {service.wait}</span>
            </div>
            <div className="mt-1 text-ink-3">{service.note}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {GRADING_SERVICES.filter((s) => s.unavailable).map((s) => (
              <Badge key={s.id} icon={<Info size={12} aria-hidden />}>
                {s.label}: {s.unavailable}
              </Badge>
            ))}
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-ink-2">Where you sell</div>
            <Segmented className="w-full [&>button]:min-h-11 [&>button]:flex-1" options={PLATFORMS.map((p) => ({ value: p.id, label: p.id === 'local' ? 'Local' : p.label }))} value={platId} onChange={(v) => q.set({ plat: v === 'ebay' ? null : v })} />
            <p className="mt-1.5 text-[12px] text-ink-3">Selling fees apply to raw and slabbed alike.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput label="Fee per card" {...q.field('fee', service.fee)} />
            <MoneyInput label="Membership a year" {...q.field('mem', service.membership)} hint="0 if you already have it" />
            <MoneyInput label="Ship to grader" {...q.field('out', 10)} hint="Whole submission, insured" />
            <MoneyInput label="Ship back" {...q.field('back', 15)} hint="Whole submission, insured" />
            <MoneyInput label="Cards in submission" prefix="×" {...q.field('batch', 1)} hint="Shipping and membership are split across them" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {!result && (
          <Card className="p-5 text-sm text-ink-2">
            <div className="mb-1 font-semibold text-ink">Fill in the three graded prices</div>
            With a raw value and what PSA 10, PSA 9 and lower grades sell for, you'll get an expected-value verdict, the PSA 10 price you need to break even, and how batching changes it.
          </Card>
        )}
        {result && V && inputs && (
          <>
            <Card className="fade-in p-5 sm:p-6">
              <Badge tone={V.tone} icon={<V.icon size={13} aria-hidden />}>
                Grading check
              </Badge>
              <div className="mt-3 text-4xl font-extrabold tracking-tight">{V.title}</div>
              <p className="mt-2 max-w-md text-[15px] text-ink-2">
                {result.verdict === 'worth' && `On average grading adds about ${money(result.advantage)} per card over selling raw, after fees and every grading cost.`}
                {result.verdict === 'marginal' && `Grading adds only about ${money(result.advantage)} on average, which is thin once you count the wait and the risk of a low grade.`}
                {result.verdict === 'raw' && `On average grading costs you about ${money(-result.advantage)} per card versus selling raw. Sell it as is.`}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
                <div>
                  <div className="text-[12px] text-ink-3">Sell raw, keep</div>
                  <div className="text-lg font-semibold tabular">{money(result.rawNet)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-ink-3">Grade, expect</div>
                  <div className="text-lg font-semibold tabular">{money(result.expectedNet - result.allIn)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-ink-3">Difference</div>
                  <div className={cx('text-lg font-semibold tabular', toneText(result.advantage))}>{signedMoney(result.advantage)}</div>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-[12px] text-ink-3">Break-even PSA 10 price</div>
              <div className="mt-0.5 text-3xl font-bold tracking-tight tabular">{result.breakEven10 == null ? '—' : result.breakEven10 === 0 ? 'Any price' : money(result.breakEven10)}</div>
              <p className="mt-1 text-[13px] text-ink-2">
                {result.breakEven10 == null
                  ? 'You set the chance of a 10 to 0%, so grading can only break even on the lower grades.'
                  : g10 != null && g10 >= result.breakEven10
                    ? `You entered ${money(g10)}, which clears it by ${money(g10 - result.breakEven10)}. Check recent PSA 10 sales to make sure that price is real.`
                    : `You entered ${money(g10)}. PSA 10 copies need to sell for at least ${money(result.breakEven10)} before grading beats selling raw at these odds.`}
              </p>
            </Card>

            <Section title="How the odds play out" className="!mb-0">
              <Card className="overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 border-b border-line px-4 py-2 text-[12px] text-ink-3">
                  <span>Grade</span>
                  <span className="w-12 text-right">Chance</span>
                  <span className="w-16 text-right">Sells</span>
                  <span className="w-16 text-right">You keep</span>
                </div>
                {result.byGrade.map((g) => (
                  <div key={g.label} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 border-b border-line px-4 py-2.5 text-[14px]">
                    <span>{g.label}</span>
                    <span className="w-12 text-right tabular">{pct(g.p, 0).replace('+', '')}</span>
                    <span className="w-16 text-right tabular">{money(g.price)}</span>
                    <span className="w-16 text-right tabular">{money(g.net)}</span>
                  </div>
                ))}
                <div className="grid grid-cols-[1fr_auto] gap-x-3 px-4 py-2.5 text-[14px] font-semibold">
                  <span>Expected after selling fees</span>
                  <span className="tabular">{money(result.expectedNet)}</span>
                </div>
              </Card>
            </Section>

            <Card className="px-4 py-2">
              <div className="divide-y divide-line">
                <Line label="Grading fee" value={money(fee)} />
                <Line label="Shipping and membership" value={money(result.allIn - fee)} sub={batch > 1 ? `${money(out + back + mem)} split across ${batch} cards` : mem ? 'Shipping both ways plus a year of membership, one card' : 'Shipping both ways, one card'} />
                <Line label="All-in cost to grade" value={money(result.allIn)} strong />
                <Line label="Wait" value={service.wait} sub="You can't sell it in the meantime, and the raw price may move." />
              </div>
            </Card>

            <Section title="Batching changes the math" sub="Break-even PSA 10 price as more cards share one submission" className="!mb-0">
              <Card className="overflow-hidden">
                {sensitivity.map((s) => (
                  <div key={s.batch} className={cx('flex items-center justify-between border-b border-line px-4 py-2.5 text-[14px] last:border-b-0', s.batch === batch && 'bg-accent-soft')}>
                    <span>
                      {s.batch === 1 ? '1 card' : `${s.batch} cards`}
                      <span className="ml-2 text-[12px] text-ink-3">{money(s.allIn)} each all-in</span>
                    </span>
                    <span className="font-semibold tabular">{s.breakEven10 == null ? '—' : money(s.breakEven10)}</span>
                  </div>
                ))}
              </Card>
            </Section>
            <Note>Expected value is an average over many cards. One card is one outcome, and a PSA 8 stings. The prices and odds are yours, so the verdict is only as good as they are. Fees and shipping are estimates; market price is not a guaranteed sale.</Note>
          </>
        )}
      </div>
    </div>
  )
}
