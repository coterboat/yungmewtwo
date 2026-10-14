// The vault's forms: add an item, edit a lot, mark some of it sold.
import { useEffect, useState } from 'react'
import { ProductThumb } from '../../components/product.tsx'
import { Button, Field, Input, Segmented, Select, Sheet } from '../../components/ui.tsx'
import { variantLabel } from '../../lib/classify.ts'
import { useProduct } from '../../lib/data.ts'
import { money } from '../../lib/format.ts'
import type { ItemPatch } from '../../lib/vaultEdit.ts'
import type { VaultItem, VaultStatus } from '../../lib/user.ts'
import { MoneyInput } from '../tools/bits.tsx'
import { CONDITIONS, KeyPrompt, useCanWrite } from './common.tsx'

type HeldStatus = Exclude<VaultStatus, 'sold'>

const STATUS_OPTIONS: Array<{ value: HeldStatus; label: string }> = [
  { value: 'have', label: 'Have' },
  { value: 'want', label: 'Want' },
  { value: 'trade', label: 'Trade' },
]

interface FormState {
  status: HeldStatus
  qty: string
  cost: string
  condition: string
  grade: string
  variant: string
}

function ItemFields({ s, set, variants, sealed }: { s: FormState; set: (patch: Partial<FormState>) => void; variants: string[]; sealed: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Field label="Status">
        <Segmented className="w-full [&>button]:min-h-11 [&>button]:flex-1" options={STATUS_OPTIONS} value={s.status} onChange={(v) => set({ status: v })} />
      </Field>
      {variants.length > 1 && (
        <Field label="Printing">
          <Select value={s.variant} onChange={(e) => set({ variant: e.target.value })}>
            <option value="">Most valuable</option>
            {variants.map((v) => (
              <option key={v} value={v}>
                {variantLabel(v)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <MoneyInput label="How many" prefix="×" value={s.qty} onChange={(v) => set({ qty: v.replace(/\./g, '') })} placeholder="1" />
        {s.status !== 'want' && <MoneyInput label="Paid each" value={s.cost} onChange={(v) => set({ cost: v })} placeholder="0.00" hint="0 for a pull. Blank if unknown." />}
      </div>
      {s.status !== 'want' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Condition">
            <Select value={s.condition} onChange={(e) => set({ condition: e.target.value })}>
              <option value="">Not set</option>
              {CONDITIONS.filter((c) => (c === 'Sealed') === sealed || c === s.condition).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          {!sealed && (
            <Field label="Graded?" hint="Optional, like PSA 10">
              <Input value={s.grade} onChange={(e) => set({ grade: e.target.value })} placeholder="Raw" />
            </Field>
          )}
        </div>
      )}
    </div>
  )
}

const toQty = (s: string) => Math.max(1, Math.round(Number(s) || 1))
const toCost = (s: string): number | undefined => (s.trim() === '' || !Number.isFinite(Number(s)) ? undefined : Math.max(0, Number(s)))

function Footer({ canWrite, saving, disabled, onSave, onClose, label }: { canWrite: boolean; saving: boolean; disabled?: boolean; onSave: () => void; onClose: () => void; label: string }) {
  if (!canWrite) return <KeyPrompt compact />
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button variant="primary" onClick={onSave} disabled={saving || disabled}>
        {saving ? 'Saving…' : label}
      </Button>
    </div>
  )
}

export function AddSheet({ productId, defaultStatus, onClose, onSave }: { productId: number | null; defaultStatus: HeldStatus; onClose: () => void; onSave: (item: Omit<VaultItem, 'id' | 'added'>, name: string) => Promise<boolean> }) {
  const canWrite = useCanWrite()
  const { data: product } = useProduct(productId)
  const shown = productId ? product : undefined
  const sealed = shown?.kind === 'sealed'
  const [s, setS] = useState<FormState>({ status: defaultStatus, qty: '1', cost: '', condition: '', grade: '', variant: '' })
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (productId) setS({ status: defaultStatus, qty: '1', cost: '', condition: '', grade: '', variant: '' })
  }, [productId, defaultStatus])
  useEffect(() => {
    if (shown) setS((x) => ({ ...x, condition: x.condition || (shown.kind === 'sealed' ? 'Sealed' : 'Near mint') }))
  }, [shown])
  const variants = shown ? Object.keys(shown.v) : []

  const save = async () => {
    setSaving(true)
    const ok = await onSave(
      {
      productId: productId as number,
      qty: toQty(s.qty),
      status: s.status,
      ...(s.variant ? { variant: s.variant } : {}),
      ...(s.status !== 'want' && toCost(s.cost) != null ? { cost: toCost(s.cost) } : {}),
      ...(s.status !== 'want' && s.condition ? { condition: s.condition } : {}),
      ...(s.status !== 'want' && s.grade.trim() && !sealed ? { grade: s.grade.trim() } : {}),
      },
      shown?.name ?? 'item',
    )
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Sheet open={productId != null} onClose={onClose} title="Add to your vault" footer={<Footer canWrite={canWrite} saving={saving} disabled={!shown} onSave={save} onClose={onClose} label="Add" />}>
      {shown ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
          <div className="flex items-center gap-3">
            <ProductThumb id={shown.id} kind={shown.kind} size="md" />
            <div className="min-w-0">
              <div className="line-clamp-2 text-[14px] font-medium">{shown.name}</div>
              <div className="text-[12px] text-ink-3">{shown.num ?? shown.rarity ?? ''}</div>
            </div>
          </div>
          <ItemFields s={s} set={(p) => setS((x) => ({ ...x, ...p }))} variants={variants} sealed={!!sealed} />
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-ink-3">Loading…</p>
      )}
    </Sheet>
  )
}

export function EditSheet({ item, name, variants, sealed, onClose, onSave }: { item: VaultItem | null; name: string; variants: string[]; sealed: boolean; onClose: () => void; onSave: (id: string, patch: ItemPatch) => Promise<boolean> }) {
  const canWrite = useCanWrite()
  const [s, setS] = useState<FormState>({ status: 'have', qty: '1', cost: '', condition: '', grade: '', variant: '' })
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (item) setS({ status: item.status === 'sold' ? 'have' : item.status, qty: String(item.qty), cost: item.cost != null ? String(item.cost) : '', condition: item.condition ?? '', grade: item.grade ?? '', variant: item.variant ?? '' })
  }, [item])

  const save = async () => {
    if (!item) return
    setSaving(true)
    const want = s.status === 'want'
    const ok = await onSave(item.id, {
      status: s.status,
      qty: toQty(s.qty),
      variant: s.variant || undefined,
      cost: want ? undefined : toCost(s.cost),
      condition: want ? undefined : s.condition || undefined,
      grade: want || sealed ? undefined : s.grade.trim() || undefined,
    })
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Sheet open={item != null} onClose={onClose} title="Edit" footer={<Footer canWrite={canWrite} saving={saving} onSave={save} onClose={onClose} label="Save" />}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <div className="text-[14px] font-medium">{name}</div>
        <ItemFields s={s} set={(p) => setS((x) => ({ ...x, ...p }))} variants={variants} sealed={sealed} />
      </div>
    </Sheet>
  )
}

export function SoldSheet({ item, name, market, onClose, onSave }: { item: VaultItem | null; name: string; market: number | null; onClose: () => void; onSave: (id: string, qty: number, price: number) => Promise<boolean> }) {
  const canWrite = useCanWrite()
  const [qty, setQty] = useState('1')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (item) {
      setQty(String(item.qty))
      setPrice('')
    }
  }, [item])
  const n = Math.min(item?.qty ?? 1, toQty(qty))
  const each = price.trim() === '' ? null : Number(price)
  const profit = each != null && item?.cost != null ? (each - item.cost) * n : null

  const save = async () => {
    if (!item || each == null || !Number.isFinite(each)) return
    setSaving(true)
    const ok = await onSave(item.id, n, each)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Sheet open={item != null} onClose={onClose} title="Mark as sold" footer={<Footer canWrite={canWrite} saving={saving} disabled={each == null || !Number.isFinite(each)} onSave={save} onClose={onClose} label="Mark sold" />}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <div className="text-[14px] font-medium">{name}</div>
        <div className="grid grid-cols-2 gap-3">
          {(item?.qty ?? 1) > 1 && <MoneyInput label={`How many (of ${item?.qty})`} prefix="×" value={qty} onChange={(v) => setQty(v.replace(/\./g, ''))} />}
          <MoneyInput label="Got each" value={price} onChange={setPrice} placeholder={market != null ? market.toFixed(2) : '0.00'} hint="What you actually kept, after fees and shipping if you know them" />
        </div>
        {market != null && each == null && <p className="text-[12px] text-ink-3">Market is {money(market)} right now. Market isn't a guaranteed sale, so enter what you really got.</p>}
        {profit != null && (
          <p className="text-[14px]">
            {profit >= 0 ? 'Profit' : 'Loss'} on this sale: <b className="tabular">{profit >= 0 ? '+' : '−'}{money(Math.abs(profit))}</b>
          </p>
        )}
      </div>
    </Sheet>
  )
}
