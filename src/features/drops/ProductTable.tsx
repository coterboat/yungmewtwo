import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Delta, Money, cx } from '../../components/ui.tsx'
import type { ProductRow } from '../../lib/drops.ts'
import { shortDate } from '../../lib/format.ts'
import { msrpText, productLabel, rankRows } from './util.ts'

/** Products with MSRP and the current TCGplayer market; pre-sale prices say so, and show the premium over MSRP. */
export function ProductTable({ rows, limit = 4, className }: { rows: ProductRow[]; limit?: number; className?: string }) {
  const [all, setAll] = useState(false)
  const ranked = useMemo(() => rankRows(rows), [rows])
  if (!rows.length) return null
  const shown = all ? ranked : ranked.slice(0, limit)
  return (
    <div className={className}>
      <ul>
        {shown.map((r, i) => {
          const t = r.tcg
          return (
            <li key={`${r.label}-${i}`} className={cx('flex items-start justify-between gap-3 py-2.5', i > 0 && 'border-t border-line')}>
              <div className="min-w-0">
                <div className="text-[13.5px] leading-snug">{productLabel(r)}</div>
                <div className="mt-0.5 text-[12px] text-ink-3">
                  {r.packs ? `${r.packs} ${r.packs === 1 ? 'pack' : 'packs'} · ` : ''}
                  {r.msrp != null ? `MSRP ${msrpText(r.msrp)}` : 'MSRP unknown'}
                  {r.date ? ` · on sale ${shortDate(r.date)}` : ''}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {t?.market != null ? (
                  <>
                    <div className="text-[14px] font-semibold">
                      <Money value={t.market} />
                    </div>
                    <div className="text-[12px] text-ink-3">
                      {r.premium != null ? (
                        <>
                          <Delta value={r.premium} digits={0} /> {t.presale ? 'pre-order premium' : 'vs MSRP'}
                        </>
                      ) : t.presale ? (
                        'pre-sale price'
                      ) : (
                        'market'
                      )}
                    </div>
                  </>
                ) : (
                  <span className="text-[12px] text-ink-3">{t ? 'No price yet' : 'Not listed yet'}</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {ranked.length > limit && (
        <button type="button" onClick={() => setAll(!all)} className="mt-1 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-accent hover:underline">
          {all ? 'Show fewer' : `Show all ${ranked.length} products`}
          <ChevronDown size={15} className={cx('transition', all && 'rotate-180')} aria-hidden />
        </button>
      )}
    </div>
  )
}
