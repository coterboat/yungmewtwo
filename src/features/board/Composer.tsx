// The "Post" sheet: pick a type, paste a link (we spot the store and suggest a title), link a
// product to get a live verdict as you type the price, set times with one-tap picks.
import { CalendarDays, Check, Link2, Loader2, Plus, StickyNote, Tag, Ticket, Zap } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from 'react'
import { ProductPickerSheet } from '../../components/product.tsx'
import { Badge, Button, Field, Input, Sheet, Textarea, cx } from '../../components/ui.tsx'
import { POST_TYPES, TYPE_META } from '../../lib/board.ts'
import { afterPicks, draftToPost, parsePrice, quickPicks, validateDraft, type Draft, type QuickPick } from '../../lib/boardCompose.ts'
import { detectStore, extractUrl, STORE_NAMES, suggestTitle } from '../../lib/boardLinks.ts'
import { newId } from '../../lib/format.ts'
import type { Post, PostType } from '../../lib/user.ts'
import type { BoardActions } from './actions.ts'
import { NeedKeyNote } from './bits.tsx'
import { DealInsight, LinkedProduct, useDealRead } from './DealInsight.tsx'

const TYPE_ICON = { deal: Tag, drawing: Ticket, drop: Zap, event: CalendarDays, note: StickyNote } as const

const BLURB: Record<PostType, string> = {
  deal: 'A price you found. Link the product and it tells you if it is a good one.',
  drawing: 'A raffle, lottery or queue with an entry deadline.',
  drop: 'A restock or pre-order going live at a set time.',
  event: 'A prerelease, league night or card show.',
  note: 'Anything else worth telling each other.',
}

function TimeField({ label, value, onChange, kind, error, hint, picks: given }: { label: string; value: string; onChange: (v: string) => void; kind: 'start' | 'end'; error?: string; hint?: string; picks?: QuickPick[] }) {
  const picks = given ?? quickPicks(Date.now(), kind)
  return (
    <div>
      <Field label={label} hint={hint}>
        <Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} className="min-w-0 appearance-none" />
      </Field>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Quick picks for ${label.toLowerCase()}`}>
        {picks.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.value)}
            className={cx(
              'min-h-11 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition active:scale-[0.97]',
              value === p.value ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface-2 text-ink-2 hover:text-ink',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-[12.5px] font-medium text-down">
          {error}
        </p>
      )}
    </div>
  )
}

function FieldError({ children }: { children?: string }) {
  return children ? (
    <p role="alert" className="mt-1.5 text-[12.5px] font-medium text-down">
      {children}
    </p>
  ) : null
}

export function Composer({ initial, editing, actions, onClose }: { initial: Draft; editing?: Post; actions: BoardActions; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(initial)
  const [titleTouched, setTitleTouched] = useState(!!initial.title)
  const [storeTouched, setStoreTouched] = useState(!!initial.store)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState(false)
  const [detected, setDetected] = useState<string | undefined>()

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const t = draft.type
  const price = parsePrice(draft.price)
  const read = useDealRead(draft.productId, price)
  const errors = submitted ? validateDraft(draft, Date.now(), { editing: !!editing }) : {}
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)

  const applyUrl = (raw: string) => {
    const link = extractUrl(raw)
    setDraft((d) => {
      const next = { ...d, url: raw }
      if (!link) return next
      const store = detectStore(link)
      const title = suggestTitle(link)
      if (store && !storeTouched) next.store = store
      if (title && !titleTouched) next.title = title
      return next
    })
    setDetected(link ? detectStore(link) : undefined)
  }

  const onPasteUrl = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    const link = extractUrl(text)
    // Share sheets paste "Check this out https://..."; keep just the link.
    if (link && text.trim() !== link) {
      e.preventDefault()
      applyUrl(link)
    }
  }

  // Sheet re-focuses whenever its onClose identity changes, so hand it a stable function.
  const closeRef = useRef<() => void>(() => {})
  useEffect(() => {
    closeRef.current = () => {
      if (busy || picker) return
      if (dirty && !submitted && !window.confirm('Discard this post?')) return
      onClose()
    }
  })
  const close = useCallback(() => closeRef.current(), [])
  const closePicker = useCallback(() => setPicker(false), [])

  const submit = async () => {
    setSubmitted(true)
    if (Object.keys(validateDraft(draft, Date.now(), { editing: !!editing })).length) return
    if (!actions.canPost || !actions.me) return
    const post = draftToPost(draft, { id: editing?.id ?? newId(), by: editing?.by ?? actions.me.id, now: Date.now(), previous: editing })
    setBusy(true)
    const ok = await (editing ? actions.replace(post) : actions.add(post))
    setBusy(false)
    if (ok) onClose()
  }

  const showProduct = t === 'deal' || t === 'drop' || t === 'drawing'
  const showPrice = t === 'deal' || t === 'drop'
  const label = TYPE_META[t].label.toLowerCase()

  return (
    <>
      <Sheet
        open
        onClose={close}
        title={editing ? 'Edit post' : 'New post'}
        footer={
          <Button type="submit" form="board-composer" variant="primary" className="w-full" disabled={busy || !actions.canPost}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
            {busy ? 'Posting…' : editing ? 'Save changes' : `Post ${label}`}
          </Button>
        }
      >
        <form
          id="board-composer"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="grid gap-4"
        >
          {!actions.canPost && <NeedKeyNote what="post" onNavigate={onClose} />}

          {!editing && (
            <div>
              <div role="tablist" aria-label="What are you posting?" className="grid grid-cols-5 gap-1.5">
                {POST_TYPES.map((p) => {
                  const Icon = TYPE_ICON[p]
                  const on = p === t
                  return (
                    <button
                      key={p}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => set('type', p)}
                      className={cx(
                        'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border text-[12px] font-medium transition active:scale-[0.97]',
                        on ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface-2 text-ink-3 hover:text-ink',
                      )}
                    >
                      <Icon size={18} aria-hidden />
                      {TYPE_META[p].label}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[12.5px] text-ink-3">{BLURB[t]}</p>
            </div>
          )}

          <div>
            <Field label="Link (optional)" hint="Paste it and we'll spot the store and suggest a title.">
              <div className="relative">
                <Link2 size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
                <Input
                  value={draft.url}
                  onChange={(e) => applyUrl(e.target.value)}
                  onPaste={onPasteUrl}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="https://www.target.com/p/…"
                  aria-invalid={!!errors.url}
                  className="pl-9"
                />
              </div>
            </Field>
            {detected && (
              <div className="mt-1.5">
                <Badge tone="good" icon={<Check size={12} aria-hidden />}>
                  Looks like {detected}
                </Badge>
              </div>
            )}
            <FieldError>{errors.url}</FieldError>
          </div>

          <div>
            <Field label="Title">
              <Input
                value={draft.title}
                onChange={(e) => {
                  setTitleTouched(true)
                  set('title', e.target.value)
                }}
                placeholder={t === 'drawing' ? 'Walmart Wednesday drawing' : t === 'drop' ? 'Pokémon Center restock' : t === 'event' ? 'League night at Game Haven' : 'Prismatic Evolutions ETB'}
                aria-invalid={!!errors.title}
                maxLength={140}
              />
            </Field>
            <FieldError>{errors.title}</FieldError>
          </div>

          {showProduct && (
            <div className="grid gap-3 rounded-2xl border border-line bg-surface-2/50 p-3">
              {draft.productId ? (
                <LinkedProduct
                  productId={draft.productId}
                  product={read.product}
                  market={read.market}
                  onRemove={() => set('productId', undefined)}
                  right={
                    <button type="button" onClick={() => setPicker(true)} className="min-h-11 shrink-0 rounded-lg px-2 text-[13px] font-medium text-accent">
                      Change
                    </button>
                  }
                />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] text-ink-2">{t === 'deal' ? 'Link the card or sealed product to score this price against market.' : 'Optional: link the product that is dropping.'}</p>
                  <Button size="sm" className="!min-h-11 shrink-0" onClick={() => setPicker(true)}>
                    <Plus size={15} aria-hidden /> Link product
                  </Button>
                </div>
              )}
              {draft.productId && showPrice && (
                <div aria-live="polite">
                  {price != null ? <DealInsight productId={draft.productId} price={price} showProduct={false} /> : <p className="text-[13px] text-ink-3">Type the price to see the verdict.</p>}
                </div>
              )}
            </div>
          )}

          {showPrice && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Field label={t === 'deal' ? 'Price' : 'Expected price (optional)'}>
                  <Input value={draft.price} onChange={(e) => set('price', e.target.value)} inputMode="decimal" placeholder="49.99" aria-invalid={!!errors.price} />
                </Field>
                <FieldError>{errors.price}</FieldError>
              </div>
              {t === 'deal' && (
                <div>
                  <Field label="Qty (optional)" hint="Price above is per item.">
                    <Input value={draft.qty} onChange={(e) => set('qty', e.target.value)} inputMode="numeric" placeholder="1" aria-invalid={!!errors.qty} />
                  </Field>
                  <FieldError>{errors.qty}</FieldError>
                </div>
              )}
            </div>
          )}

          {t !== 'event' && t !== 'note' && (
            <Field label="Store">
              <Input
                list="board-stores"
                value={draft.store}
                onChange={(e) => {
                  setStoreTouched(true)
                  set('store', e.target.value)
                }}
                placeholder="Target, Walmart, Pokémon Center…"
                autoCapitalize="words"
              />
              <datalist id="board-stores">
                {STORE_NAMES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
          )}

          {t === 'drawing' && <TimeField label="Entries close" kind="end" value={draft.ends} onChange={(v) => set('ends', v)} error={errors.ends} />}
          {t === 'deal' && <TimeField label="Deal ends (optional)" kind="end" value={draft.ends} onChange={(v) => set('ends', v)} error={errors.ends} hint="Leave empty if there's no deadline." />}
          {t === 'drop' && <TimeField label="Goes live" kind="start" value={draft.starts} onChange={(v) => set('starts', v)} error={errors.starts} />}
          {t === 'event' && (
            <>
              <TimeField label="Starts" kind="start" value={draft.starts} onChange={(v) => set('starts', v)} error={errors.starts} />
              <TimeField label="Ends (optional)" kind="end" value={draft.ends} onChange={(v) => set('ends', v)} error={errors.ends} picks={afterPicks(draft.starts)} hint={draft.starts ? undefined : 'Set the start first and you can pick a length.'} />
            </>
          )}

          {(t === 'drop' || t === 'event') && (
            <Field label={t === 'event' ? 'Where' : 'Where (optional)'}>
              <Input value={draft.where} onChange={(e) => set('where', e.target.value)} placeholder={t === 'event' ? 'Game Haven, Roswell' : 'Roswell store, online…'} />
            </Field>
          )}

          <Field label="Note (optional)">
            <Textarea value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder={t === 'note' ? 'What do you want to tell each other?' : 'Limit 2, in-store only, code is…'} maxLength={1000} />
          </Field>
        </form>
      </Sheet>
      <ProductPickerSheet
        open={picker}
        onClose={closePicker}
        title="Link a product"
        onPick={(row) => {
          setDraft((d) => ({ ...d, productId: row[0], title: d.title.trim() ? d.title : row[1] }))
        }}
      />
    </>
  )
}
