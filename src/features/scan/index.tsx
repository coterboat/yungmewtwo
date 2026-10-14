// Scan cards: photograph one card, a binder page or a pile; Claude reads each card, we match it to
// the catalog, you fix anything off and add them all to your vault in one commit.
import Anthropic from '@anthropic-ai/sdk'
import { Camera, Check, ChevronDown, ImagePlus, KeyRound, Minus, Plus, RefreshCw, ScanLine, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProductPickerSheet, ProductThumb, setLabel } from '../../components/product.tsx'
import { withToast } from '../../components/toast.tsx'
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Money, PageHeader, Segmented, Sheet, cx } from '../../components/ui.tsx'
import { displayName } from '../../lib/classify.ts'
import { loadData, loadProduct, useSetMap } from '../../lib/data.ts'
import { money, newId } from '../../lib/format.ts'
import { useMe } from '../../lib/people.ts'
import { setPrefs, usePrefs } from '../../lib/prefs.ts'
import { matchDetected, matchQuality, pickVariant, type Candidate, type Detected, type MatchQuality } from '../../lib/scan.ts'
import { preparePhoto, scanPhotos, SCAN_MODELS, type PreparedPhoto, type ScanModel } from '../../lib/scanClient.ts'
import type { IndexRow } from '../../lib/site.ts'
import type { VaultItem, VaultStatus } from '../../lib/user.ts'
import { updateUserFile } from '../../lib/userData.ts'

interface Row {
  key: string
  read: Detected
  candidates: Candidate[]
  chosen: IndexRow | null
  quality: MatchQuality
  qty: number
  include: boolean
}

const MAX_PHOTOS = 5
const QUALITY: Record<MatchQuality, { label: string; tone: 'good' | 'accent' | 'warning' | 'critical' }> = {
  sure: { label: 'Sure', tone: 'good' },
  likely: { label: 'Likely', tone: 'accent' },
  check: { label: 'Check this', tone: 'warning' },
  none: { label: 'No match', tone: 'critical' },
}

export default function ScanPage() {
  const prefs = usePrefs()
  const me = useMe()
  const sets = useSetMap()
  const [editingKey, setEditingKey] = useState(false)
  const [photos, setPhotos] = useState<PreparedPhoto[]>([])
  const [busy, setBusy] = useState<'prep' | 'scan' | 'add' | null>(null)
  const [error, setError] = useState<string>()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [cost, setCost] = useState(0)
  const [status, setStatus] = useState<VaultStatus>('have')
  const [done, setDone] = useState<{ count: number; value: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const needsKey = !prefs.anthropicKey || editingKey

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setError(undefined)
    setBusy('prep')
    try {
      const room = MAX_PHOTOS - photos.length
      const next = await Promise.all([...files].slice(0, room).map(preparePhoto))
      setPhotos((p) => [...p, ...next])
    } catch {
      setError("Couldn't read that photo. Try a JPEG or PNG.")
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const scan = async () => {
    if (!prefs.anthropicKey || !photos.length) return
    setError(undefined)
    setBusy('scan')
    setDone(null)
    try {
      const [en, jp] = await Promise.all([loadData<IndexRow[]>('index-en.json'), loadData<IndexRow[]>('index-jp.json')])
      const res = await scanPhotos(photos, prefs.anthropicKey, prefs.scanModel)
      setCost((c) => c + res.cost)
      setRows(
        res.cards.map((read, i) => {
          const candidates = matchDetected(read, read.language === 'JP' ? jp : en, sets)
          const quality = matchQuality(candidates)
          // Only confident matches start ticked; a guess should never quietly inflate the vault.
          return { key: `${i}-${read.name}`, read, candidates, chosen: candidates[0]?.row ?? null, quality, qty: read.quantity, include: quality === 'sure' || quality === 'likely' }
        }),
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const included = (rows ?? []).filter((r) => r.include && r.chosen)
  const total = included.reduce((s, r) => s + (r.chosen![7] ?? 0) * r.qty, 0)
  const best = included.reduce<Row | null>((b, r) => ((r.chosen![7] ?? 0) > (b?.chosen![7] ?? -1) ? r : b), null)

  const addAll = async () => {
    if (!me || !included.length) return
    setBusy('add')
    // Resolve each pick's stored variant (reverse/normal/holo) from its product's price variants.
    const now = new Date().toISOString()
    const additions: VaultItem[] = await Promise.all(
      included.map(async (r) => {
        const product = await loadProduct(r.chosen![0]).catch(() => undefined)
        const variant = pickVariant(r.read.variant, product ? Object.keys(product.v) : [], r.chosen![6])
        return { id: newId(), productId: r.chosen![0], ...(variant ? { variant } : {}), qty: r.qty, status, added: now, note: 'scanned' }
      }),
    )
    const count = additions.reduce((s, a) => s + a.qty, 0)
    const ok = await withToast(
      () =>
        updateUserFile<VaultItem>(
          `vault-${me.id}`,
          (items) => {
            const next = [...items]
            for (const a of additions) {
              const same = next.findIndex((x) => x.productId === a.productId && x.variant === a.variant && x.status === a.status)
              if (same >= 0) next[same] = { ...next[same], qty: next[same].qty + a.qty }
              else next.push(a)
            }
            return next
          },
          `vault: ${me.name} scanned in ${count} card${count === 1 ? '' : 's'}`,
        ),
      `Added ${count} to your vault`,
    )
    setBusy(null)
    if (ok) {
      setDone({ count, value: total })
      setRows(null)
      setPhotos([])
    }
  }

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null)

  return (
    <div className="fade-in">
      <PageHeader
        title="Scan cards"
        sub="Snap one card, a binder page, or a pile. Each card gets read, matched and priced, and you add them all at once."
        action={
          prefs.anthropicKey && !editingKey ? (
            <Button variant="ghost" size="sm" onClick={() => setEditingKey(true)}>
              <KeyRound size={15} /> Scan settings
            </Button>
          ) : undefined
        }
      />

      {needsKey ? (
        <KeySetup onDone={() => setEditingKey(false)} />
      ) : done ? (
        <Card holo className="p-6 text-center">
          <Sparkles className="mx-auto mb-2 text-accent" />
          <div className="text-xl font-bold">
            {done.count} card{done.count === 1 ? '' : 's'} added
          </div>
          <div className="mt-1 text-ink-2">
            Worth about <span className="holo-text font-semibold">{money(done.value)}</span> at market today.
          </div>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="primary" onClick={() => setDone(null)}>
              <Camera size={16} /> Scan more
            </Button>
            <Link to="/vault">
              <Button>Open vault</Button>
            </Link>
          </div>
        </Card>
      ) : rows ? (
        <Results
          rows={rows}
          sets={sets}
          status={status}
          setStatus={setStatus}
          total={total}
          best={best}
          cost={cost}
          busy={busy === 'add'}
          canSave={!!prefs.token && !!me}
          onUpdate={update}
          onAdd={addAll}
          onRescan={() => {
            setRows(null)
          }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addFiles(e.target.files)} />
            {photos.length === 0 ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-line-strong bg-surface text-center transition hover:border-accent sm:aspect-[16/9]"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Camera size={28} />
                </span>
                <span className="text-lg font-semibold">Take or choose photos</span>
                <span className="max-w-xs text-sm text-ink-3">Up to {MAX_PHOTOS} at a time. Lay cards flat in good light with the bottom numbers visible.</span>
              </button>
            ) : (
              <div className={cx('relative grid gap-2', photos.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
                {photos.map((p, i) => (
                  <div key={p.preview} className="relative overflow-hidden rounded-2xl border border-line bg-surface-2">
                    <img src={p.preview} alt={`Photo ${i + 1}`} className="max-h-[60dvh] w-full object-contain" />
                    {busy === 'scan' && <div className="scan-sweep pointer-events-none absolute inset-0" />}
                    {!busy && (
                      <button type="button" aria-label="Remove photo" onClick={() => setPhotos((ps) => ps.filter((x) => x !== p))} className="absolute top-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {error && (
              <div className="mt-3">
                <ErrorNote>{error}</ErrorNote>
              </div>
            )}
          </div>
          <div className="grid content-start gap-3">
            {photos.length > 0 && (
              <>
                <Button variant="primary" className="min-h-12 text-[15px]" disabled={!!busy} onClick={scan}>
                  {busy === 'scan' ? (
                    <>
                      <ScanLine size={18} className="animate-pulse" /> Reading cards…
                    </>
                  ) : (
                    <>
                      <ScanLine size={18} /> Scan {photos.length} photo{photos.length === 1 ? '' : 's'}
                    </>
                  )}
                </Button>
                {photos.length < MAX_PHOTOS && (
                  <Button disabled={!!busy} onClick={() => fileRef.current?.click()}>
                    <ImagePlus size={16} /> Add another photo
                  </Button>
                )}
              </>
            )}
            <Card className="p-4 text-[13px] text-ink-2">
              <div className="mb-1.5 font-semibold text-ink">Tips for a clean read</div>
              <ul className="grid gap-1">
                <li>• Flat, even light; avoid glare on holos.</li>
                <li>• Keep the bottom strip (number + set code) in view.</li>
                <li>• A 3×3 binder page reads well in one shot.</li>
                <li>• Sleeves are fine; toploaders can glare.</li>
              </ul>
              <div className="mt-3 text-ink-3">
                Using {SCAN_MODELS[prefs.scanModel].label} · about {prefs.scanModel === 'claude-opus-5-5' ? '3–6¢' : 'a fraction of a cent'} per photo, billed to your Anthropic key.
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function Results(props: {
  rows: Row[]
  sets: ReturnType<typeof useSetMap>
  status: VaultStatus
  setStatus: (s: VaultStatus) => void
  total: number
  best: Row | null
  cost: number
  busy: boolean
  canSave: boolean
  onUpdate: (key: string, patch: Partial<Row>) => void
  onAdd: () => void
  onRescan: () => void
}) {
  const { rows, sets, status, setStatus, total, best, cost, busy, canSave, onUpdate, onAdd, onRescan } = props
  const [picking, setPicking] = useState<string | null>(null)
  const [alts, setAlts] = useState<string | null>(null)
  const count = rows.filter((r) => r.include && r.chosen).reduce((s, r) => s + r.qty, 0)
  const unsure = rows.filter((r) => r.quality === 'check' || r.quality === 'none').length

  if (!rows.length)
    return (
      <Empty icon={<ScanLine size={20} />} title="No cards found in that photo" action={<Button onClick={onRescan}>Try another photo</Button>}>
        Try brighter light, less glare, and keeping the whole card in frame.
      </Empty>
    )

  const altRow = rows.find((r) => r.key === alts)

  return (
    <div>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[13px] text-ink-3">
              Found {rows.length} card{rows.length === 1 ? '' : 's'}
              {unsure ? ` · ${unsure} need${unsure === 1 ? 's' : ''} a look` : ''}
            </div>
            <div className="mt-0.5 text-[30px] leading-none font-bold tracking-tight">
              <Money value={total} />
            </div>
            <div className="mt-1 text-[12.5px] text-ink-3">at market today{cost ? ` · this scan cost ~${cost < 0.01 ? '<1¢' : `${Math.round(cost * 100)}¢`}` : ''}</div>
          </div>
          {best?.chosen && (best.chosen[7] ?? 0) > 0 && (
            <div className="holo-ring flex items-center gap-2 rounded-2xl bg-surface-2 py-2 pr-3 pl-2">
              <ProductThumb id={best.chosen[0]} kind={best.chosen[3]} size="sm" />
              <div className="text-[12px]">
                <div className="text-ink-3">Best pull</div>
                <div className="max-w-40 truncate font-semibold">{displayName(best.chosen[1])}</div>
                <Money value={best.chosen[7]} className="font-semibold" />
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-2">
        {rows.map((r) => (
          <ScanRow key={r.key} r={r} sets={sets} onUpdate={onUpdate} onChange={() => setAlts(r.key)} />
        ))}
      </div>

      <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 mt-4 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur lg:bottom-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[13px] text-ink-2">Add as</span>
          <Segmented size="sm" value={status} onChange={setStatus} options={[{ value: 'have', label: 'Have' }, { value: 'want', label: 'Want' }, { value: 'trade', label: 'Trade' }]} />
        </div>
        {canSave ? (
          <Button variant="primary" className="min-h-12 w-full text-[15px]" disabled={busy || count === 0} onClick={onAdd}>
            <Check size={18} /> {busy ? 'Adding…' : `Add ${count} card${count === 1 ? '' : 's'} · ${money(total)}`}
          </Button>
        ) : (
          <div className="text-center text-[13px] text-ink-2">
            To save these, <Link to="/settings" className="font-medium text-accent">add your posting key</Link> and pick who you are.
          </div>
        )}
        <button type="button" onClick={onRescan} className="mt-2 flex w-full items-center justify-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
          <RefreshCw size={13} /> Start over
        </button>
      </div>

      <Sheet open={!!altRow} onClose={() => setAlts(null)} title="Which card is it?">
        {altRow && (
          <>
            <p className="mb-3 text-[13px] text-ink-3">
              Read as: {altRow.read.name}
              {altRow.read.number && ` · ${altRow.read.number}`}
              {altRow.read.setCode && ` · ${altRow.read.setCode}`}
            </p>
            <div className="-mx-2 grid">
              {altRow.candidates.map((c) => (
                <button
                  key={c.row[0]}
                  type="button"
                  onClick={() => {
                    onUpdate(altRow.key, { chosen: c.row, include: true, quality: 'sure' })
                    setAlts(null)
                  }}
                  className={cx('flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2', altRow.chosen?.[0] === c.row[0] && 'bg-accent-soft')}
                >
                  <ProductThumb id={c.row[0]} kind={c.row[3]} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{displayName(c.row[1])}</div>
                    <div className="truncate text-[12px] text-ink-3">
                      {setLabel(sets?.get(c.row[2]))} {c.row[4] && `· ${c.row[4]}`} {c.row[5] && `· ${c.row[5]}`}
                    </div>
                  </div>
                  <Money value={c.row[7]} className="text-[14px] font-semibold" />
                </button>
              ))}
            </div>
            <Button
              className="mt-3 w-full"
              onClick={() => {
                setPicking(altRow.key)
                setAlts(null)
              }}
            >
              <Search size={16} /> Search for it instead
            </Button>
          </>
        )}
      </Sheet>
      <ProductPickerSheet
        open={!!picking}
        onClose={() => setPicking(null)}
        title="Find the right card"
        onPick={(row) => {
          if (picking) onUpdate(picking, { chosen: row, include: true, quality: 'sure' })
        }}
      />
    </div>
  )
}

function ScanRow({ r, sets, onUpdate, onChange }: { r: Row; sets: ReturnType<typeof useSetMap>; onUpdate: (key: string, patch: Partial<Row>) => void; onChange: () => void }) {
  const q = QUALITY[r.chosen && r.quality === 'none' ? 'sure' : r.quality]
  return (
    <Card className={cx('p-3', !r.include && 'opacity-55')}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={r.include}
          aria-label={r.include ? 'Included' : 'Skipped'}
          disabled={!r.chosen}
          onClick={() => onUpdate(r.key, { include: !r.include })}
          className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition', r.include ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong')}
        >
          {r.include && <Check size={16} />}
        </button>
        {r.chosen ? <ProductThumb id={r.chosen[0]} kind={r.chosen[3]} size="md" /> : <div className="flex aspect-[63/88] w-12 items-center justify-center rounded-md bg-surface-2 text-ink-3">?</div>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold">{r.chosen ? displayName(r.chosen[1]) : r.read.name}</div>
          <div className="truncate text-[12px] text-ink-3">
            {r.chosen ? (
              <>
                {setLabel(sets?.get(r.chosen[2]))} {r.chosen[4] && `· ${r.chosen[4]}`}
              </>
            ) : (
              'Not in the catalog yet. Search for it.'
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={q.tone}>{q.label}</Badge>
            <button type="button" onClick={onChange} className="inline-flex min-h-7 items-center gap-0.5 text-[12px] font-medium text-accent">
              {r.chosen ? 'Change' : 'Find it'} <ChevronDown size={13} />
            </button>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Money value={r.chosen ? (r.chosen[7] ?? null) : null} className="text-[14px] font-semibold" />
          <div className="flex items-center rounded-lg border border-line">
            <button type="button" aria-label="Fewer" className="flex h-8 w-8 items-center justify-center text-ink-2" onClick={() => onUpdate(r.key, { qty: Math.max(1, r.qty - 1) })}>
              <Minus size={14} />
            </button>
            <span className="w-6 text-center text-[13px] font-semibold tabular">{r.qty}</span>
            <button type="button" aria-label="More" className="flex h-8 w-8 items-center justify-center text-ink-2" onClick={() => onUpdate(r.key, { qty: r.qty + 1 })}>
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>
      {(r.read.note || r.quality === 'check') && (
        <div className="mt-2 pl-10 text-[12px] text-ink-3">
          Read: {r.read.name}
          {r.read.number ? ` · ${r.read.number}` : ' · number not readable'}
          {r.read.setCode && ` · ${r.read.setCode}`}
          {r.read.note && ` · ${r.read.note}`}
        </div>
      )}
    </Card>
  )
}

function KeySetup({ onDone }: { onDone: () => void }) {
  const prefs = usePrefs()
  const [key, setKey] = useState(prefs.anthropicKey ?? '')
  const [model, setModel] = useState<ScanModel>(prefs.scanModel)
  const [state, setState] = useState<{ checking?: boolean; error?: string }>({})
  const valid = useMemo(() => key.trim().startsWith('sk-ant-'), [key])
  useEffect(() => setState({}), [key])

  const save = async () => {
    setState({ checking: true })
    try {
      // Free check: fetch the model's metadata with the key.
      await new Anthropic({ apiKey: key.trim(), dangerouslyAllowBrowser: true }).models.retrieve(model)
      setPrefs({ anthropicKey: key.trim(), scanModel: model })
      onDone()
    } catch (err) {
      setState({ error: err instanceof Anthropic.AuthenticationError ? 'Anthropic rejected that key.' : `Couldn't verify the key: ${(err as Error).message}` })
    }
  }

  return (
    <Card className="max-w-xl p-5">
      <div className="mb-1 flex items-center gap-2 font-semibold">
        <KeyRound size={18} className="text-accent" /> Connect a Claude API key
      </div>
      <p className="mb-4 text-sm text-ink-2">
        Card reading uses Claude's vision. It needs an Anthropic API key, kept only on this device and sent only to Anthropic. A Claude.ai subscription doesn't include API use; keys are pay-as-you-go
        at console.anthropic.com.
      </p>
      <ol className="mb-4 grid gap-1 text-[13px] text-ink-2">
        <li>
          1. Open{' '}
          <a className="font-medium text-accent" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
            console.anthropic.com → API keys
          </a>
        </li>
        <li>2. Create key → name it "yungmewtwo" → copy it</li>
        <li>3. Paste it here</li>
      </ol>
      <Field label="API key">
        <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" />
      </Field>
      <div className="mt-4">
        <div className="mb-1.5 text-[13px] font-medium text-ink-2">Model</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(SCAN_MODELS) as ScanModel[]).map((m) => (
            <button key={m} type="button" onClick={() => setModel(m)} className={cx('rounded-xl border p-3 text-left transition', model === m ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2 hover:border-line-strong')}>
              <div className="text-sm font-semibold">{SCAN_MODELS[m].label}</div>
              <div className="text-[12px] text-ink-3">{SCAN_MODELS[m].blurb}</div>
              <div className="mt-1 text-[12px] text-ink-2">{m === 'claude-opus-5-5' ? '~3–6¢ per photo' : '~0.1–0.2¢ per photo'}</div>
            </button>
          ))}
        </div>
      </div>
      {state.error && (
        <div className="mt-3">
          <ErrorNote>{state.error}</ErrorNote>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Button variant="primary" disabled={!valid || state.checking} onClick={save}>
          {state.checking ? 'Checking…' : 'Save key'}
        </Button>
        {prefs.anthropicKey && (
          <>
            <Button onClick={onDone}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                setPrefs({ anthropicKey: null })
                setKey('')
              }}
            >
              Remove key
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}
