// The "is this a good price?" read on a deal: the linked product, a verdict badge (a steal gets the
// holo treatment), how far under or over market, cost per pack and a flip estimate after fees.
import { ArrowDownRight, ArrowUpRight, Sparkles, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ProductThumb } from '../../components/product.tsx'
import { Badge, Money, Skeleton, cx } from '../../components/ui.tsx'
import { headline, useProduct } from '../../lib/data.ts'
import { scoreDeal, verdictTone, type DealScore } from '../../lib/deal.ts'
import { money, pct } from '../../lib/format.ts'
import type { SiteProduct } from '../../lib/site.ts'

export interface DealRead {
  product: SiteProduct | undefined
  loading: boolean
  market: number | null
  score: DealScore | undefined
}

export function useDealRead(productId: number | undefined, price: number | undefined): DealRead {
  const { data, loading } = useProduct(productId ?? null)
  // The hook keeps the last product when the id clears or changes; only trust a matching one.
  const product = productId && data && data.id === productId ? data : undefined
  const top = product ? headline(product) : undefined
  const market = top ? (top[1][0] ?? top[1][1]) : null
  const score = price != null && product ? scoreDeal({ price, market, msrp: product.msrp, packs: product.packs }) : undefined
  return { product, loading: !!productId && loading && !product, market, score }
}

export function VerdictBadge({ score }: { score: DealScore }) {
  const tone = verdictTone(score.verdict)
  return (
    <Badge tone={tone} icon={score.verdict === 'steal' ? <Sparkles size={12} aria-hidden /> : undefined} className="!text-[12.5px] !px-2.5 !py-1">
      {score.label}
    </Badge>
  )
}

/** "32% under market" / "12% over market" with an arrow, so it never relies on color. */
export function VsMarket({ value, className }: { value: number | null; className?: string }) {
  if (value == null) return null
  if (Math.abs(value) < 0.005) return <span className={cx('text-[13px] text-ink-2', className)}>At market</span>
  const under = value < 0
  const Icon = under ? ArrowDownRight : ArrowUpRight
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-[13px] font-medium tabular', under ? 'text-up' : 'text-down', className)}>
      <Icon size={14} aria-hidden />
      {pct(Math.abs(value), 0).replace('+', '')} {under ? 'under' : 'over'} market
    </span>
  )
}

function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-between rounded-xl bg-surface-2 px-2.5 py-2" title={hint}>
      <div className="text-[11.5px] leading-tight text-ink-3">{label}</div>
      <div className="mt-1 text-[14px] font-semibold whitespace-nowrap tabular">{children}</div>
    </div>
  )
}

/** The linked product as a compact line: thumb, name, market and MSRP. */
export function LinkedProduct({ productId, market, product, onRemove, right }: { productId: number; market?: number | null; product?: SiteProduct; onRemove?: () => void; right?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ProductThumb id={productId} kind={product?.kind ?? 'sealed'} size="md" />
      <div className="min-w-0 flex-1">
        {product ? (
          <Link to={`/item/${productId}`} className="line-clamp-2 text-[14px] leading-snug font-medium [overflow-wrap:anywhere] hover:underline">
            {product.name}
          </Link>
        ) : (
          <div className="truncate text-[14px] font-medium text-ink-2">Product #{productId}</div>
        )}
        <div className="mt-0.5 text-[12px] text-ink-3">
          {market != null ? (
            <>
              Market <Money value={market} />
              {product?.msrp ? (
                <>
                  {' '}
                  · MSRP <Money value={product.msrp} />
                </>
              ) : null}
            </>
          ) : product ? (
            'No market price yet'
          ) : (
            'Loading price…'
          )}
        </div>
      </div>
      {right}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Remove linked product" className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink">
          <X size={17} aria-hidden />
        </button>
      )}
    </div>
  )
}

/** Verdict + numbers for a price on a linked product. `price` undefined shows just the product. */
export function DealInsight({ productId, price, showProduct = true, className }: { productId: number; price: number | undefined; showProduct?: boolean; className?: string }) {
  const { product, loading, market, score } = useDealRead(productId, price)
  if (loading) return <Skeleton className={cx('h-16', className)} />
  return (
    <div className={cx('grid grid-cols-1 gap-3', className)}>
      {showProduct && <LinkedProduct productId={productId} product={product} market={market} />}
      {score && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <VerdictBadge score={score} />
            <VsMarket value={score.vsMarket} />
            {score.vsMarket == null && score.vsMsrp != null && <span className="text-[13px] text-ink-2">{pct(score.vsMsrp, 0)} vs MSRP</span>}
          </div>
          {(score.perPack != null || score.flip != null || score.vsMsrp != null) && (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Per pack">{score.perPack != null ? money(score.perPack) : '—'}</Stat>
              <Stat label="Est. flip after fees" hint="Selling at market on TCGplayer, minus about 13% fees and shipping. An estimate, not a promise.">
                {score.flip != null ? `${score.flip >= 0 ? '+' : '−'}${money(Math.abs(score.flip))}` : '—'}
              </Stat>
              <Stat label="Vs MSRP">{score.vsMsrp != null ? (Math.abs(score.vsMsrp) < 0.005 ? 'At MSRP' : pct(score.vsMsrp, 0)) : '—'}</Stat>
            </div>
          )}
        </>
      )}
    </div>
  )
}
