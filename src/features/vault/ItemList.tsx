// The list view: one line per lot with what it's worth and what it made, and inline actions.
import { ArrowDownRight, ArrowUpRight, ChevronDown, Handshake, HandCoins, Pencil, PartyPopper, Target, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { ProductThumb, setLabel } from '../../components/product.tsx'
import { Badge, Button, Card, Delta, cx } from '../../components/ui.tsx'
import { variantLabel } from '../../lib/classify.ts'
import { money, pct } from '../../lib/format.ts'
import type { VaultStatus, WatchItem } from '../../lib/user.ts'
import { targetGap } from '../../lib/vault.ts'
import type { VaultRow } from '../../lib/vaultFilter.ts'
import { KeyPrompt, useCanWrite } from './common.tsx'

export interface RowActions {
  onEdit: (row: VaultRow) => void
  onMove: (row: VaultRow, status: VaultStatus) => void
  onSold: (row: VaultRow) => void
  onRemove: (row: VaultRow) => void
  onGotIt: (row: VaultRow) => void
  onFund: (row: VaultRow) => void
}

export const itemName = (r: VaultRow) => r.product?.name ?? `Product ${r.item.productId}`

function GainLine({ r }: { r: VaultRow }) {
  const g = r.valued.gain
  if (r.valued.market == null) return <span className="text-[12px] text-ink-3">No price yet</span>
  if (g == null) return <span className="text-[12px] text-ink-3">No cost saved</span>
  const flat = Math.abs(g) < 0.005
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-[12px] font-medium tabular', flat ? 'text-ink-3' : g > 0 ? 'text-up' : 'text-down')}>
      {!flat && (g > 0 ? <ArrowUpRight size={13} aria-hidden /> : <ArrowDownRight size={13} aria-hidden />)}
      {g >= 0 ? '+' : '−'}
      {money(Math.abs(g))}
      {r.valued.gainPct != null && <span className="font-normal"> ({pct(r.valued.gainPct, 0)})</span>}
    </span>
  )
}

function Meta({ r }: { r: VaultRow }) {
  const { item, product, set } = r
  const variant = item.variant ?? r.valued.quote?.variant
  const showVariant = product?.kind === 'card' && variant && variant !== 'N' && variant !== 'H'
  return (
    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-ink-3">
      {set && <span className="truncate">{setLabel(set)}</span>}
      {product?.num && <span className="tabular">· {product.num}</span>}
      {showVariant && <span>· {variantLabel(variant as string)}</span>}
      {item.condition && item.condition !== 'Sealed' && <span>· {item.condition}</span>}
      {item.grade && (
        <Badge tone="accent" className="!px-1.5 !py-0 !text-[10.5px]">
          {item.grade}
        </Badge>
      )}
      {set?.lang === 'JP' && <Badge className="!px-1.5 !py-0 !text-[10px]">JP</Badge>}
    </div>
  )
}

function RightSide({ r, tab, watch }: { r: VaultRow; tab: VaultStatus; watch?: WatchItem }) {
  const { item, valued: v } = r
  if (tab === 'want') {
    const gap = targetGap(v.market, watch?.target)
    return (
      <div className="shrink-0 text-right">
        <div className="text-[14px] font-semibold tabular">{money(v.market)}</div>
        {v.quote?.low != null && v.quote.low !== v.market && <div className="text-[12px] text-ink-3 tabular">low {money(v.quote.low)}</div>}
        {v.quote?.change7d != null && <Delta value={v.quote.change7d} className="text-[12px]" />}
        {gap && (
          <div className={cx('mt-0.5 flex items-center justify-end gap-1 text-[11.5px] tabular', gap.hit ? 'font-semibold text-up' : 'text-ink-3')}>
            <Target size={11} aria-hidden />
            {gap.hit ? `At your ${money(watch?.target)} target` : `${pct(gap.pct, 0).replace('+', '')} above ${money(watch?.target)}`}
          </div>
        )}
      </div>
    )
  }
  if (tab === 'sold') {
    const total = item.soldFor != null ? item.soldFor * item.qty : null
    const gain = item.soldFor != null && item.cost != null ? (item.soldFor - item.cost) * item.qty : null
    return (
      <div className="shrink-0 text-right">
        <div className="text-[14px] font-semibold tabular">{money(total)}</div>
        <div className="text-[12px] text-ink-3 tabular">{item.soldFor != null ? `${money(item.soldFor)} ea` : ''}</div>
        {gain != null && (
          <div className={cx('text-[12px] font-medium tabular', gain >= 0 ? 'text-up' : 'text-down')}>
            {gain >= 0 ? '+' : '−'}
            {money(Math.abs(gain))}
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="shrink-0 text-right">
      <div className="text-[14px] font-semibold tabular">{money(v.value)}</div>
      <div className="text-[12px] text-ink-3 tabular">{item.cost != null ? `cost ${money(item.cost * item.qty)}` : ' '}</div>
      <GainLine r={r} />
    </div>
  )
}

function Actions({ r, tab, a, canWrite }: { r: VaultRow; tab: VaultStatus; a: RowActions; canWrite: boolean }) {
  const [confirm, setConfirm] = useState(false)
  if (!canWrite) return <KeyPrompt compact />
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => a.onEdit(r)}>
        <Pencil size={14} aria-hidden /> Edit
      </Button>
      {tab === 'have' && (
        <Button onClick={() => a.onMove(r, 'trade')}>
          <Handshake size={14} aria-hidden /> Move to trade
        </Button>
      )}
      {tab === 'trade' && (
        <Button onClick={() => a.onMove(r, 'have')}>
          <Undo2 size={14} aria-hidden /> Back to have
        </Button>
      )}
      {(tab === 'have' || tab === 'trade') && (
        <Button onClick={() => a.onSold(r)}>
          <HandCoins size={14} aria-hidden /> Mark sold
        </Button>
      )}
      {tab === 'want' && (
        <>
          <Button variant="primary" onClick={() => a.onGotIt(r)}>
            <PartyPopper size={14} aria-hidden /> Got it
          </Button>
          <Button onClick={() => a.onFund(r)}>
            <HandCoins size={14} aria-hidden /> Fund this
          </Button>
        </>
      )}
      <Button
        variant="danger"
        onClick={() => {
          if (confirm) a.onRemove(r)
          else setConfirm(true)
        }}
        onBlur={() => setConfirm(false)}
      >
        <Trash2 size={14} aria-hidden /> {confirm ? 'Tap again to remove' : 'Remove'}
      </Button>
    </div>
  )
}

export function ItemList({ rows, tab, actions, editable, watchFor, limit = 60 }: { rows: VaultRow[]; tab: VaultStatus; actions: RowActions; editable: boolean; watchFor: (productId: number) => WatchItem | undefined; limit?: number }) {
  const [open, setOpen] = useState<string | null>(null)
  const [shown, setShown] = useState(limit)
  const canWrite = useCanWrite()
  const visible = rows.slice(0, shown)
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line">
        {visible.map((r) => {
          const expanded = open === r.item.id
          return (
            <li key={r.item.id}>
              <div className="flex items-center gap-1 pr-1 pl-3">
                <a href={`#/item/${r.item.productId}`} className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-2.5 transition hover:opacity-90">
                  <ProductThumb id={r.item.productId} kind={r.product?.kind ?? 'card'} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="line-clamp-2 text-[14px] leading-snug font-medium">{itemName(r)}</span>
                      {r.item.qty > 1 && <span className="shrink-0 rounded-md bg-surface-3 px-1.5 py-px text-[11.5px] font-semibold tabular">×{r.item.qty}</span>}
                    </div>
                    <Meta r={r} />
                  </div>
                  <RightSide r={r} tab={tab} watch={tab === 'want' ? watchFor(r.item.productId) : undefined} />
                </a>
                {editable ? (
                  <button type="button" aria-label={expanded ? 'Hide actions' : `Actions for ${itemName(r)}`} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r.item.id)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-surface-2 hover:text-ink">
                    <ChevronDown size={18} className={cx('transition', expanded && 'rotate-180')} />
                  </button>
                ) : (
                  <span className="w-3" />
                )}
              </div>
              {expanded && (
                <div className="fade-in border-t border-line bg-surface-2/60 px-3 py-3">
                  <Actions r={r} tab={tab} a={actions} canWrite={canWrite} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {rows.length > shown && (
        <div className="border-t border-line p-2 text-center">
          <Button variant="ghost" onClick={() => setShown(shown + 60)}>
            Show {Math.min(60, rows.length - shown)} more of {rows.length - shown}
          </Button>
        </div>
      )}
    </Card>
  )
}
