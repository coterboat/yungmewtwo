// The two write actions on an item: watch it (with buy/sell targets) and add it to your vault.
import { Minus, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Field, Input, Segmented, Sheet, Textarea, Select, cx } from '../../components/ui.tsx'
import { withToast } from '../../components/toast.tsx'
import { variantLabel } from '../../lib/classify.ts'
import { money, newId } from '../../lib/format.ts'
import { usePrefs } from '../../lib/prefs.ts'
import type { Person, VaultItem, VaultStatus, WatchItem } from '../../lib/user.ts'
import { updateUserFile } from '../../lib/userData.ts'
import { FieldGroup, NeedKey } from './parts.tsx'

interface Subject {
  productId: number
  name: string
  variant: string | undefined
  /** Several variants exist, so the variant is worth naming. */
  multi: boolean
  market: number | null
  kind: 'card' | 'sealed'
}

const parseMoney = (t: string): number | null | 'bad' => {
  const s = t.trim().replace(/^\$/, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 'bad'
}

const rounded = (n: number) => String(Math.round(n * 100) / 100)

function QuickPicks({ market, steps, onPick }: { market: number | null; steps: number[]; onPick: (v: number) => void }) {
  if (!market) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {steps.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(market * (1 + s))}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 text-[12.5px] font-medium text-ink-2 transition hover:border-line-strong hover:text-ink"
        >
          {s > 0 ? '+' : '−'}
          {Math.abs(Math.round(s * 100))}%<span className="text-ink-3 tabular">{money(market * (1 + s))}</span>
        </button>
      ))}
    </div>
  )
}

export function WatchSheet({ open, onClose, subject, existing, me }: { open: boolean; onClose: () => void; subject: Subject; existing: WatchItem | undefined; me: Person | undefined }) {
  const { token } = usePrefs()
  const [target, setTarget] = useState('')
  const [above, setAbove] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setTarget(existing?.target != null ? rounded(existing.target) : '')
    setAbove(existing?.above != null ? rounded(existing.above) : '')
    setNote(existing?.note ?? '')
    // Fill the form when the sheet opens, not each time the file refreshes underneath it.
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const t = parseMoney(target)
  const a = parseMoney(above)
  const error = t === 'bad' || a === 'bad' ? 'Prices need to be positive numbers.' : typeof t === 'number' && typeof a === 'number' && a <= t ? 'The sell price should be higher than the buy price.' : null
  const canSave = !!me && !!token && !error && !busy

  const save = async () => {
    if (!me || error) return
    const item: WatchItem = {
      id: existing?.id ?? newId(),
      by: me.id,
      productId: subject.productId,
      variant: subject.variant,
      target: typeof t === 'number' ? t : undefined,
      above: typeof a === 'number' ? a : undefined,
      note: note.trim() || undefined,
      added: existing?.added ?? new Date().toISOString(),
    }
    setBusy(true)
    const ok = await withToast(
      () => updateUserFile<WatchItem>('watch', (items) => (items.some((w) => w.id === item.id) ? items.map((w) => (w.id === item.id ? item : w)) : [...items, item]), `${existing ? 'Update watch for' : 'Watch'} ${subject.name}`),
      existing ? 'Watch updated' : 'Added to your watchlist',
    )
    setBusy(false)
    if (ok) onClose()
  }

  const remove = async () => {
    if (!existing) return
    setBusy(true)
    const ok = await withToast(() => updateUserFile<WatchItem>('watch', (items) => items.filter((w) => w.id !== existing.id), `Stop watching ${subject.name}`), 'Removed from your watchlist')
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit watch' : 'Watch this'}
      footer={
        <div className="flex gap-2">
          {existing && (
            <Button variant="danger" onClick={remove} disabled={!token || busy}>
              Stop watching
            </Button>
          )}
          <Button variant="primary" onClick={save} disabled={!canSave} className="flex-1">
            {busy ? 'Saving…' : existing ? 'Save changes' : 'Start watching'}
          </Button>
        </div>
      }
    >
      <div className="mb-4 rounded-xl bg-surface-2 px-3.5 py-3 text-sm">
        <div className="font-medium">{subject.name}</div>
        <div className="mt-0.5 text-[13px] text-ink-3">
          {subject.multi && subject.variant ? `${variantLabel(subject.variant)} · ` : ''}market {money(subject.market)}
        </div>
      </div>
      {!me && <p className="mb-4 rounded-xl bg-surface-2 px-3.5 py-3 text-[13px] text-ink-2">Pick who you are first (your name, top right), so the watch lands on your list.</p>}
      <NeedKey className="mb-4" />
      <div className="grid gap-4">
        <Field label="Buy when it drops to" hint="Your watchlist shows how far the market is from this price.">
          <Input inputMode="decimal" placeholder="Optional, e.g. 120" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.$]/g, ''))} />
          <QuickPicks market={subject.market} steps={[-0.05, -0.1, -0.15, -0.2]} onPick={(v) => setTarget(rounded(v))} />
        </Field>
        <Field label="Sell when it reaches" hint="A price where you'd cash out.">
          <Input inputMode="decimal" placeholder="Optional, e.g. 200" value={above} onChange={(e) => setAbove(e.target.value.replace(/[^0-9.$]/g, ''))} />
          <QuickPicks market={subject.market} steps={[0.1, 0.25, 0.5]} onPick={(v) => setAbove(rounded(v))} />
        </Field>
        <Field label="Note">
          <Textarea rows={2} placeholder="Optional: why you want it, which condition…" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="text-[13px] text-down">
            {error}
          </p>
        )}
        <p className="text-[12px] text-ink-3">Targets compare against TCGplayer's market price (recent sales), not a single listing. With no target, it's just tracked.</p>
      </div>
    </Sheet>
  )
}

const CONDITIONS = ['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged']

export function VaultSheet({ open, onClose, subject, owned, me }: { open: boolean; onClose: () => void; subject: Subject; owned: VaultItem[]; me: Person | undefined }) {
  const { token } = usePrefs()
  const [status, setStatus] = useState<VaultStatus>('have')
  const [qty, setQty] = useState(1)
  const [cost, setCost] = useState('')
  const [condition, setCondition] = useState(CONDITIONS[0])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setStatus('have')
    setQty(1)
    setCost('')
    setCondition(CONDITIONS[0])
    setNote('')
  }, [open])

  const c = parseMoney(cost)
  const error = c === 'bad' ? 'What you paid needs to be a positive number.' : null
  const canSave = !!me && !!token && !error && !busy && qty >= 1
  const have = owned.filter((v) => v.status === 'have').reduce((n, v) => n + v.qty, 0)

  const save = async () => {
    if (!me || error) return
    const item: VaultItem = {
      id: newId(),
      productId: subject.productId,
      variant: subject.variant,
      qty,
      status,
      cost: status !== 'want' && typeof c === 'number' ? c : undefined,
      condition: subject.kind === 'card' && status !== 'want' ? condition : undefined,
      note: note.trim() || undefined,
      added: new Date().toISOString(),
    }
    setBusy(true)
    const ok = await withToast(() => updateUserFile<VaultItem>(`vault-${me.id}`, (items) => [...items.filter((v) => v.id !== item.id), item], `Vault: ${status} ${subject.name}`), status === 'want' ? 'Added to your wants' : 'Added to your vault')
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add to vault"
      footer={
        <Button variant="primary" onClick={save} disabled={!canSave} className="w-full">
          {busy ? 'Saving…' : 'Add to vault'}
        </Button>
      }
    >
      <div className="mb-4 rounded-xl bg-surface-2 px-3.5 py-3 text-sm">
        <div className="font-medium">{subject.name}</div>
        <div className="mt-0.5 text-[13px] text-ink-3">
          {subject.multi && subject.variant ? `${variantLabel(subject.variant)} · ` : ''}market {money(subject.market)}
          {have > 0 && <> · you have {have} in your vault</>}
        </div>
      </div>
      {!me && <p className="mb-4 rounded-xl bg-surface-2 px-3.5 py-3 text-[13px] text-ink-2">Pick who you are first (your name, top right), so this goes in your vault.</p>}
      <NeedKey className="mb-4" />
      <div className="grid gap-4">
        <FieldGroup label="What is it?">
          <Segmented<VaultStatus>
            className="flex w-full [&>button]:flex-1"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'have', label: 'I have it' },
              { value: 'want', label: 'I want it' },
              { value: 'trade', label: 'For trade' },
            ]}
          />
        </FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <Field label="How many">
            <div className="flex items-center gap-1">
              <button type="button" aria-label="One fewer" onClick={() => setQty(Math.max(1, qty - 1))} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 hover:border-line-strong">
                <Minus size={16} />
              </button>
              <Input inputMode="numeric" value={qty} onChange={(e) => setQty(Math.max(1, Math.min(999, Number(e.target.value.replace(/\D/g, '')) || 1)))} className="text-center tabular" aria-label="Quantity" />
              <button type="button" aria-label="One more" onClick={() => setQty(Math.min(999, qty + 1))} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 hover:border-line-strong">
                <Plus size={16} />
              </button>
            </div>
          </Field>
          {status !== 'want' && (
            <Field label="Paid each">
              <Input inputMode="decimal" placeholder="Optional" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^0-9.$]/g, ''))} />
            </Field>
          )}
        </div>
        {subject.kind === 'card' && status !== 'want' && (
          <Field label="Condition">
            <Select value={condition} onChange={(e) => setCondition(e.target.value)}>
              {CONDITIONS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Note">
          <Textarea rows={2} placeholder="Optional: where it came from, sleeved, graded…" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="text-[13px] text-down">
            {error}
          </p>
        )}
        <p className={cx('text-[12px] text-ink-3', !owned.length && 'hidden')}>
          This adds a new entry. See and edit everything on the{' '}
          <Link to="/vault" onClick={onClose} className="text-accent underline underline-offset-2">
            Vault page
          </Link>
          .
        </p>
      </div>
    </Sheet>
  )
}
