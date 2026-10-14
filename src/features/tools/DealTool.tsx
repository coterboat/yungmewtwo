// Deal check: is this price good? Scores a price against market and MSRP, and shows what a flip
// would make on each platform. Pick a product, type what's being asked.
import { AlertTriangle, Check, Info, Megaphone, Minus, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Card, Chips, Field, Input, Section, cx } from '../../components/ui.tsx'
import { scoreDeal, verdictTone, type Verdict } from '../../lib/deal.ts'
import { boardDealPath } from '../../lib/dealLink.ts'
import { useProduct } from '../../lib/data.ts'
import { money, pct } from '../../lib/format.ts'
import { allPlatforms } from '../../lib/flipcalc.ts'
import { quoteFor } from '../../lib/vault.ts'
import { Line, MoneyInput, Note, ProductField, VariantSelect, signedMoney, toneText, useQ } from './bits.tsx'

/** Local sales usually close a little under market. */
const LOCAL_DISCOUNT = 0.1

const STORES = ['Target', 'Walmart', 'Costco', "Sam's Club", 'Pokémon Center', 'Best Buy', 'GameStop', 'Barnes & Noble', 'Dick’s', 'Local card shop']

const ICON: Record<Verdict, typeof Check> = { steal: Sparkles, great: Check, good: Check, fair: Minus, over: AlertTriangle, unknown: Info }

/** "12.5% under" / "At market" for a price ratio; the words carry the direction, not just color. */
function rel(v: number | null, digits: number, base: string): string {
  if (v == null) return '—'
  if (Math.abs(v) < 0.0005) return `At ${base}`
  return `${(Math.abs(v) * 100).toFixed(digits)}% ${v < 0 ? 'under' : 'over'}`
}

function plainVerdict(v: Verdict, vsMarket: number | null): string {
  if (vsMarket == null) return 'No market price to compare against, so this leans on MSRP alone.'
  const away = `${Math.abs(vsMarket * 100).toFixed(vsMarket !== 0 && Math.abs(vsMarket) < 0.1 ? 1 : 0)}%`
  if (v === 'steal') return `${away} under market. Buy it, then decide whether to flip or keep.`
  if (v === 'great') return `${away} under market. A clear win.`
  if (v === 'good') return vsMarket <= 0 ? `${away} under market, or right at it. Fair to buy.` : `About market price. Fair to buy.`
  if (v === 'fair') return `${away} over market. You'd pay a bit extra for convenience.`
  return `${away} over market. Wait, or shop around.`
}

export default function DealTool() {
  const q = useQ()
  const productId = q.num('product') ?? null
  const { data: loaded } = useProduct(productId)
  const product = productId ? loaded : undefined
  const variant = q.get('variant')
  const price = q.num('price')
  const store = q.get('store')

  const quote = quoteFor(product, variant || undefined)
  const market = quote?.market ?? null
  const msrp = product?.msrp ?? null
  const score = product && price != null && price > 0 ? scoreDeal({ price, market, msrp, packs: product.packs }) : null
  const rows = price != null && price > 0 && market ? allPlatforms({ buy: price, sell: market, localDiscount: LOCAL_DISCOUNT }) : []
  const Icon = score ? ICON[score.verdict] : Info

  const quick: Array<{ value: string; label: string }> = []
  if (msrp) quick.push({ value: String(msrp), label: `MSRP ${money(msrp)}` })
  if (market) quick.push({ value: String(Math.round(market * 100) / 100), label: `Market ${money(market)}` })

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <Card className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4">
        <ProductField id={productId} onPick={(id) => q.set({ product: id, variant: null })} onClear={() => q.set({ product: null, variant: null })} label="What is it?" />
        <VariantSelect product={product} value={variant} onChange={(v) => q.set({ variant: v })} />
        <MoneyInput label="Price you were offered" value={q.get('price')} onChange={(v) => q.set({ price: v })} placeholder="0.00" />
        {quick.length > 0 && <Chips options={quick} value={String(price ?? '')} onChange={(v) => q.set({ price: v })} />}
        <Field label="Store (optional)">
          <Input list="deal-stores" value={store} onChange={(e) => q.set({ store: e.target.value })} placeholder="Target, a card show, a friend…" />
          <datalist id="deal-stores">
            {STORES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {!product && (
          <Card className="p-5 text-sm text-ink-2">
            <div className="mb-1 font-semibold text-ink">Pick a product and a price</div>
            You'll get a verdict against market and MSRP, the price per pack for sealed, and what a flip would net on each platform after fees.
          </Card>
        )}
        {product && !score && (
          <Card className="p-5 text-sm text-ink-2">
            <div className="mb-1 font-semibold text-ink">Now the price</div>
            Type what you're being asked for {product.kind === 'sealed' ? '(for the whole box, not per pack)' : ''}.
            {market ? <> Market right now is <b className="text-ink">{money(market)}</b>.</> : null}
          </Card>
        )}

        {score && product && (
          <>
            <Card holo={score.verdict === 'steal'} className="fade-in p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <Badge tone={verdictTone(score.verdict)} icon={<Icon size={13} aria-hidden />}>
                  Deal check
                </Badge>
              </div>
              <div className={cx('mt-3 text-4xl font-extrabold tracking-tight', score.verdict === 'steal' && 'holo-text')}>{score.label}</div>
              <p className="mt-2 max-w-md text-[15px] text-ink-2">{plainVerdict(score.verdict, score.vsMarket)}</p>
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
                <div>
                  <div className="text-[12px] text-ink-3">You pay</div>
                  <div className="text-lg font-semibold tabular">{money(price)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-ink-3">Market</div>
                  <div className="text-lg font-semibold tabular">{money(market)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-ink-3">vs market</div>
                  <div className={cx('text-lg font-semibold tabular', score.vsMarket == null ? 'text-ink-3' : score.vsMarket <= 0 ? 'text-up' : 'text-down')}>{pct(score.vsMarket, 0)}</div>
                </div>
              </div>
            </Card>

            <Card className="px-4 py-2">
              <div className="divide-y divide-line">
                <Line label="Compared with market" value={rel(score.vsMarket, 1, 'market')} sub={market ? `TCGplayer market ${money(market)}${quote?.low ? ` · lowest listing ${money(quote.low)}` : ''}` : 'No market price yet'} />
                <Line label="Compared with MSRP" value={rel(score.vsMsrp, 0, 'MSRP')} sub={msrp ? `MSRP ${money(msrp)}` : 'No MSRP on file'} />
                {product.packs ? <Line label="Per pack" value={money(score.perPack)} sub={market ? `Market is ${money(market / product.packs)} a pack · ${product.packs} packs` : `${product.packs} packs`} /> : null}
              </div>
            </Card>

            {rows.length > 0 && (
              <Section title="If you flipped it" sub={`Bought at ${money(price)}, sold at market (${money(market)})`} className="!mb-0">
                <Card className="overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-line px-4 py-2 text-[12px] text-ink-3">
                    <span>Platform</span>
                    <span className="text-right">You keep</span>
                    <span className="w-24 text-right">Profit</span>
                  </div>
                  {rows.map((r) => (
                    <div key={r.platform.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-line px-4 py-2.5 last:border-b-0">
                      <span className="text-[14px]">
                        {r.platform.label}
                        {r.best && <Badge tone="accent" className="ml-2">Best</Badge>}
                        {r.platform.id === 'local' && <span className="block text-[11px] text-ink-3">sold at {money(r.soldAt)}, ~10% under market</span>}
                      </span>
                      <span className="text-right text-[14px] tabular">{money(r.net)}</span>
                      <span className={cx('w-24 text-right text-[14px] font-semibold tabular', toneText(r.profit))}>
                        {signedMoney(r.profit)}
                        <span className="block text-[11px] font-normal text-ink-3">{r.roi == null ? '' : pct(r.roi, 0)}</span>
                      </span>
                    </div>
                  ))}
                </Card>
                <Note>Market price is what recent sales averaged, not a guaranteed sale, and a slow-moving card can sit. Fees and shipping are estimates, and the local row assumes you close about 10% under market.</Note>
              </Section>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={boardDealPath({ productId: product.id, price: price as number, store })}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-strong active:scale-[0.98]"
              >
                <Megaphone size={16} aria-hidden /> Post to board
              </Link>
              <span className="text-[12px] text-ink-3">Opens the board's new-deal form with this filled in.</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
