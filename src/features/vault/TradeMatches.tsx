// Where the two vaults meet: what your cousin has that you want, what you have that they want,
// and the cards you both want (so you don't end up bidding against each other).
import { ArrowLeftRight, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { ProductThumb } from '../../components/product.tsx'
import { Badge, Card, cx } from '../../components/ui.tsx'
import { money } from '../../lib/format.ts'
import type { TradeMatch, TradeMatches } from '../../lib/vaultTrade.ts'

export interface ProductInfo {
  name: string
  market: number | null
  kind: 'card' | 'sealed'
}

function Line({ m, info, headline, sub }: { m: TradeMatch; info?: ProductInfo; headline: string; sub?: string }) {
  return (
    <li>
      <a href={`#/item/${m.productId}`} className="flex min-h-12 items-center gap-3 rounded-xl px-1.5 py-1 hover:bg-surface-2">
        <ProductThumb id={m.productId} kind={info?.kind ?? 'card'} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-1.5 text-[13.5px] leading-snug font-medium">
            {headline}
            {m.tradeFlag && (
              <Badge tone="holo" className="!py-0">
                Up for trade
              </Badge>
            )}
          </span>
          {sub && <span className="block truncate text-[12px] text-ink-3">{sub}</span>}
        </span>
        <span className="shrink-0 text-[13px] font-semibold tabular">{money(info?.market)}</span>
      </a>
    </li>
  )
}

export function TradeMatchesCard({ matches, other, info }: { matches: TradeMatches; other: string; info: (productId: number) => ProductInfo | undefined }) {
  // Open on desktop, folded to a one-line teaser on phones so the page doesn't start with a wall of matches.
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 1024px)').matches)
  const total = matches.theyHave.length + matches.iHave.length + matches.bothWant.length
  if (!total) return null
  const nm = (id: number) => info(id)?.name ?? `Product ${id}`
  const first = matches.theyHave[0] ?? matches.iHave[0] ?? matches.bothWant[0]
  const teaser = matches.theyHave[0] ? `${other} has your ${nm(first.productId)}` : matches.iHave[0] ? `${other} wants your ${nm(first.productId)}` : `You both want ${nm(first.productId)}`
  return (
    <section>
      <Card className="overflow-hidden">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
          <ArrowLeftRight size={18} className="shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">
              Trade matches <span className="ml-1 rounded-full bg-accent-soft px-2 py-0.5 text-[12px] text-accent tabular">{total}</span>
            </span>
            {open ? (
              <span className="block text-[12.5px] text-ink-3">Where you and {other} line up</span>
            ) : (
              <span className="block truncate text-[12.5px] text-ink-3">
                {teaser}
                {total > 1 ? ` and ${total - 1} more` : ''}
              </span>
            )}
          </span>
          <ChevronDown size={18} className={cx('shrink-0 text-ink-3 transition', open && 'rotate-180')} aria-hidden />
        </button>
        {open && (
          <div className="fade-in grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-line p-3">
            {matches.theyHave.length > 0 && (
              <div>
                <div className="mb-1 px-1.5 text-[12px] font-medium text-ink-3">{other} has what you want</div>
                <ul>
                  {matches.theyHave.map((m) => (
                    <Line key={m.mine.id} m={m} info={info(m.productId)} headline={`${other} has your ${nm(m.productId)}`} sub={m.theirs.qty > 1 ? `${m.theirs.qty} copies` : undefined} />
                  ))}
                </ul>
              </div>
            )}
            {matches.iHave.length > 0 && (
              <div>
                <div className="mb-1 px-1.5 text-[12px] font-medium text-ink-3">You have what {other} wants</div>
                <ul>
                  {matches.iHave.map((m) => (
                    <Line key={m.theirs.id} m={m} info={info(m.productId)} headline={`${other} wants your ${nm(m.productId)}`} sub={m.tradeFlag ? undefined : 'Flag it for trade if you would part with it'} />
                  ))}
                </ul>
              </div>
            )}
            {matches.bothWant.length > 0 && (
              <div>
                <div className="mb-1 px-1.5 text-[12px] font-medium text-ink-3">You both want</div>
                <ul>
                  {matches.bothWant.map((m) => (
                    <Line key={m.mine.id} m={m} info={info(m.productId)} headline={nm(m.productId)} sub="Coordinate so you don't bid against each other" />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </section>
  )
}
