// Binder view: your cards in 3x3 pocket pages you can swipe through, sealed product on a shelf.
// A value chip rides each pocket and a holo shimmer marks anything that has gained.
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ProductThumb } from '../../components/product.tsx'
import { Card, cx } from '../../components/ui.tsx'
import { money } from '../../lib/format.ts'
import type { VaultStatus } from '../../lib/user.ts'
import type { VaultRow } from '../../lib/vaultFilter.ts'
import { itemName } from './ItemList.tsx'

const PER_PAGE = 9

function Pocket({ r, ghost }: { r: VaultRow; ghost: boolean }) {
  const gained = (r.valued.gain ?? 0) > 0
  const sealed = r.product?.kind === 'sealed'
  return (
    <a
      href={`#/item/${r.item.productId}`}
      aria-label={`${itemName(r)}, ${r.valued.market != null ? money(r.valued.market) : 'no price'}${r.item.qty > 1 ? `, ${r.item.qty} copies` : ''}${gained ? ', up since you added it' : ''}`}
      className="group relative block rounded-[10px] bg-[#0d0b14]/70 p-[5px] shadow-[inset_0_2px_6px_rgba(0,0,0,0.6),0_1px_0_rgba(255,255,255,0.06)] transition active:scale-[0.98]"
    >
      <div className={cx('relative overflow-hidden rounded-md', ghost && 'opacity-55 grayscale')}>
        <ProductThumb id={r.item.productId} kind={sealed ? 'sealed' : 'card'} size="lg" className="rounded-md" />
        {/* plastic sleeve gloss */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_38%,rgba(255,255,255,0)_70%,rgba(255,255,255,0.07)_100%)]" aria-hidden />
        {gained && !ghost && (
          <div
            className="pointer-events-none absolute inset-0 animate-[holo-shift_5s_ease-in-out_infinite_alternate] opacity-30 mix-blend-color-dodge motion-reduce:animate-none"
            style={{ background: 'var(--holo)', backgroundSize: '220% 100%' }}
            aria-hidden
          />
        )}
        {r.item.qty > 1 && <span className="absolute top-1 right-1 rounded-md bg-black/70 px-1.5 py-px text-[11px] font-bold text-white tabular">×{r.item.qty}</span>}
        <span className="absolute bottom-1 left-1 rounded-full bg-black/75 px-2 py-0.5 text-[11px] leading-tight font-semibold text-white tabular">{ghost ? 'Want · ' : ''}{r.valued.market != null ? money(r.valued.market) : '—'}</span>
      </div>
    </a>
  )
}

function EmptyPocket() {
  return <div className="aspect-[63/88] rounded-[10px] border border-dashed border-white/10 bg-[#0d0b14]/35 shadow-[inset_0_2px_6px_rgba(0,0,0,0.5)]" aria-hidden />
}

function Shelf({ rows, ghost }: { rows: VaultRow[]; ghost: boolean }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[14px] font-semibold">Sealed shelf</h3>
        <span className="text-[12px] text-ink-3">{rows.reduce((s, r) => s + r.item.qty, 0)} items</span>
      </div>
      <div className="no-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pt-2 pb-0">
        {rows.map((r) => (
          <a key={r.item.id} href={`#/item/${r.item.productId}`} aria-label={`${itemName(r)}, ${money(r.valued.market)}`} className="relative block w-28 shrink-0 snap-start sm:w-32">
            <div className={cx('relative aspect-square overflow-hidden rounded-lg', ghost && 'opacity-55 grayscale')}>
              <ProductThumb id={r.item.productId} kind="sealed" size="lg" className="rounded-lg" />
              {r.item.qty > 1 && <span className="absolute top-1 right-1 rounded-md bg-black/70 px-1.5 py-px text-[11px] font-bold text-white tabular">×{r.item.qty}</span>}
              <span className="absolute bottom-1 left-1 rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-semibold text-white tabular">{money(r.valued.market)}</span>
              {(r.valued.gain ?? 0) > 0 && !ghost && <div className="pointer-events-none absolute inset-0 animate-[holo-shift_5s_ease-in-out_infinite_alternate] opacity-25 mix-blend-color-dodge motion-reduce:animate-none" style={{ background: 'var(--holo)', backgroundSize: '220% 100%' }} aria-hidden />}
            </div>
          </a>
        ))}
      </div>
      <div className="h-2.5 rounded-sm bg-gradient-to-b from-surface-3 to-surface-2 shadow-[0_6px_10px_-4px_rgba(0,0,0,0.6)]" aria-hidden />
    </div>
  )
}

export function Binder({ rows, tab }: { rows: VaultRow[]; tab: VaultStatus }) {
  const cards = rows.filter((r) => r.product?.kind !== 'sealed')
  const sealed = rows.filter((r) => r.product?.kind === 'sealed')
  const ghost = tab === 'want'
  const pages = Math.max(1, Math.ceil(cards.length / PER_PAGE))
  const scroller = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)

  const go = useCallback((i: number) => {
    const el = scroller.current
    if (!el) return
    const next = Math.max(0, Math.min(pages - 1, i))
    el.scrollTo({ left: next * el.clientWidth, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [pages])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => setPage(Math.round(el.scrollLeft / (el.clientWidth || 1)))
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Back to the first page when the set of cards changes (a filter, a tab).
  useEffect(() => {
    scroller.current?.scrollTo({ left: 0 })
    setPage(0)
  }, [tab, cards.length])

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {cards.length > 0 && (
        <div>
          <div className="relative mx-auto w-full max-w-[460px]">
            <div className="rounded-2xl border border-line bg-gradient-to-br from-surface-2 to-surface p-3 pl-6 shadow-card" style={{ boxShadow: 'var(--shadow), inset 0 0 0 1px rgba(255,255,255,0.03)' }}>
              {/* ring holes */}
              <div className="pointer-events-none absolute top-0 bottom-0 left-2.5 flex flex-col justify-around py-6" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="block h-3.5 w-3.5 rounded-full bg-bg shadow-[inset_0_1px_3px_rgba(0,0,0,0.7)] ring-1 ring-line" />
                ))}
              </div>
              <div ref={scroller} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto scroll-smooth" role="group" aria-label="Binder pages" tabIndex={0}>
                {Array.from({ length: pages }, (_, p) => {
                  const slice = cards.slice(p * PER_PAGE, (p + 1) * PER_PAGE)
                  return (
                    <div key={p} className="grid w-full shrink-0 snap-start grid-cols-3 gap-2.5 sm:gap-3" aria-label={`Page ${p + 1} of ${pages}`}>
                      {slice.map((r) => (
                        <Pocket key={r.item.id} r={r} ghost={ghost} />
                      ))}
                      {Array.from({ length: PER_PAGE - slice.length }, (_, i) => (
                        <EmptyPocket key={`e${i}`} />
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <button type="button" onClick={() => go(page - 1)} disabled={page === 0} aria-label="Previous page" className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink-2 transition hover:text-ink disabled:opacity-30">
                <ChevronLeft size={18} />
              </button>
              <span className="min-w-24 text-center text-[13px] text-ink-2 tabular">
                Page {page + 1} of {pages}
              </span>
              <button type="button" onClick={() => go(page + 1)} disabled={page >= pages - 1} aria-label="Next page" className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink-2 transition hover:text-ink disabled:opacity-30">
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      )}
      {sealed.length > 0 && (
        <Card className="p-4">
          <Shelf rows={sealed} ghost={ghost} />
        </Card>
      )}
    </div>
  )
}
