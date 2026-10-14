// Flip calculator: buy price, sell price, platform -> what you keep, profit, ROI, break-even.
import { Badge, Button, Card, Segmented, Section, cx } from '../../components/ui.tsx'
import { useProduct } from '../../lib/data.ts'
import { PLATFORMS } from '../../lib/fees.ts'
import { allPlatforms, flipResult, sellPriceForRoi, withShipping } from '../../lib/flipcalc.ts'
import { money, pct } from '../../lib/format.ts'
import { quoteFor } from '../../lib/vault.ts'
import { MoneyInput, Note, ProductField, VariantSelect, signedMoney, toneText, useQ } from './bits.tsx'

export default function FlipTool() {
  const q = useQ()
  const productId = q.num('product') ?? null
  const { data: loaded } = useProduct(productId)
  const product = productId ? loaded : undefined
  const quote = quoteFor(product, q.get('variant') || undefined)
  const market = quote?.market ?? null

  const buy = q.num('buy')
  const sellTyped = q.num('sell')
  const sell = sellTyped ?? market ?? undefined
  const qty = Math.max(1, Math.round(q.num('qty') ?? 1))
  const ship = q.num('ship') ?? null
  const platId = (PLATFORMS.find((p) => p.id === q.get('plat'))?.id ?? 'tcgplayer') as (typeof PLATFORMS)[number]['id']
  const platform = withShipping(PLATFORMS.find((p) => p.id === platId) ?? PLATFORMS[0], platId === 'local' ? null : ship)

  const ready = buy != null && sell != null && sell > 0
  const result = ready ? flipResult({ buy: buy as number, sell: sell as number, platform, qty }) : null
  const rows = ready ? allPlatforms({ buy: buy as number, sell: sell as number, qty, ship, localDiscount: sellTyped == null ? 0.1 : 0 }) : []
  const target20 = buy ? sellPriceForRoi(buy, 0.2, platform) : null

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <Card className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4">
        <ProductField id={productId} onPick={(id) => q.set({ product: id, variant: null })} onClear={() => q.set({ product: null, variant: null })} label="Fill in the market price from a product (optional)" empty="Pick a card or sealed product" />
        <VariantSelect product={product} value={q.get('variant')} onChange={(v) => q.set({ variant: v })} />
        <div className="grid grid-cols-2 gap-3">
          <MoneyInput label="You buy at" value={q.get('buy')} onChange={(v) => q.set({ buy: v })} placeholder="0.00" hint="Each. 0 for a pull." />
          <MoneyInput label="You sell at" value={q.get('sell')} onChange={(v) => q.set({ sell: v })} placeholder={market ? market.toFixed(2) : '0.00'} hint={market && sellTyped == null ? 'Using market' : undefined} />
        </div>
        {market != null && sellTyped != null && Math.abs(sellTyped - market) > 0.005 && (
          <div>
            <Button variant="ghost" onClick={() => q.set({ sell: null })}>
              Use market {money(market)}
            </Button>
          </div>
        )}
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-ink-2">Where you sell</div>
          <Segmented className="w-full [&>button]:min-h-11 [&>button]:flex-1" options={PLATFORMS.map((p) => ({ value: p.id, label: p.label }))} value={platId} onChange={(v) => q.set({ plat: v === 'tcgplayer' ? null : v })} />
          <p className="mt-1.5 text-[12px] text-ink-3">{PLATFORMS.find((p) => p.id === platId)?.note}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MoneyInput label="Quantity" prefix="×" value={q.get('qty')} onChange={(v) => q.set({ qty: v })} placeholder="1" />
          {platId !== 'local' && <MoneyInput label="Shipping you pay" value={q.get('ship')} onChange={(v) => q.set({ ship: v })} placeholder={String(platform.ship)} hint="Optional override" />}
        </div>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {!result && (
          <Card className="p-5 text-sm text-ink-2">
            <div className="mb-1 font-semibold text-ink">Enter a buy price</div>
            Add what you paid (or 0 for a pull) and a sell price. Pick a product to use its market price as the default.
          </Card>
        )}
        {result && (
          <>
            <Card className="fade-in p-5 sm:p-6">
              <div className="text-[13px] text-ink-3">Profit on {platform.label}{qty > 1 ? ` · ${qty} items` : ''}</div>
              <div className={cx('mt-1 text-4xl font-extrabold tracking-tight tabular', toneText(result.totalProfit))}>{signedMoney(result.totalProfit)}</div>
              <div className="mt-1 text-[14px] text-ink-2">
                {result.roi == null ? 'Free pull, so ROI is not defined' : `${pct(result.roi, 0)} return`}
                {result.profit < 0 && ' · you would lose money'}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
                <div>
                  <div className="text-[12px] text-ink-3">You keep</div>
                  <div className="text-lg font-semibold tabular">{money(result.net)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-ink-3">Fees + shipping</div>
                  <div className="text-lg font-semibold tabular">{money(result.fees)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-ink-3">Break-even</div>
                  <div className="text-lg font-semibold tabular">{money(result.breakEven)}</div>
                </div>
              </div>
              {target20 != null && <p className="mt-3 text-[13px] text-ink-2">To make 20% you'd need to sell at {money(target20)}.</p>}
            </Card>

            <Section title="Every platform" sub="Same buy and sell price, different fees" className="!mb-0">
              <Card className="overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 border-b border-line px-4 py-2 text-[12px] text-ink-3">
                  <span>Platform</span>
                  <span className="text-right">Keep</span>
                  <span className="w-20 text-right">Profit</span>
                  <span className="w-20 text-right">Break-even</span>
                </div>
                {rows.map((r) => (
                  <div key={r.platform.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 border-b border-line px-4 py-2.5 last:border-b-0">
                    <span className="min-w-0 text-[14px]">
                      {r.platform.label}
                      {r.best && <Badge tone="accent" className="ml-2">Best</Badge>}
                      {r.soldAt !== sell && <span className="block text-[11px] text-ink-3">sold at {money(r.soldAt)}, ~10% under market</span>}
                    </span>
                    <span className="text-right text-[14px] tabular">{money(r.net)}</span>
                    <span className={cx('w-20 text-right text-[14px] font-semibold tabular', toneText(r.profit))}>
                      {signedMoney(r.profit)}
                      <span className="block text-[11px] font-normal text-ink-3">{r.roi == null ? '' : pct(r.roi, 0)}</span>
                    </span>
                    <span className="w-20 text-right text-[14px] tabular">{money(r.breakEven)}</span>
                  </div>
                ))}
              </Card>
              <Note>Fees and shipping are estimates (see the platform note above). A sale price you type is a guess; the market price is recent sales, not a guaranteed buyer. With a market price filled in, the local row assumes you close about 10% under it.</Note>
            </Section>

          </>
        )}
      </div>
    </div>
  )
}
