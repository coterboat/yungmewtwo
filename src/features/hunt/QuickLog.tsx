// The 10-second "I'm at this store, here's what I saw" log. Pick a store, tap a result: saved.
// The optional details (items, note, another time) turn the result buttons into a selection
// and add a Save button, so the fast path stays at two or three taps.
import { Check, ChevronDown, LocateFixed, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast, withToast } from '../../components/toast.tsx'
import { Button, Field, Input, Segmented, Sheet, Textarea, cx } from '../../components/ui.tsx'
import { useData } from '../../lib/data.ts'
import { newId } from '../../lib/format.ts'
import { ITEM_CHIPS, RESULTS, buildSighting, clockNow, recentSetChips, resolveWhen, resultLabel, sightingLine, sightingMessage, type ReleaseLite, type WhenMode } from '../../lib/huntLog.ts'
import type { LatLng } from '../../lib/huntOsm.ts'
import { filterViews, sortByMiles, viewStores, withPosition, type StoreView } from '../../lib/huntStores.ts'
import { personName } from '../../lib/people.ts'
import type { Sighting, SightingResult } from '../../lib/user.ts'
import { updateUserFile } from '../../lib/userData.ts'
import { ChainBadge, KeyNote } from './bits.tsx'
import { RESULT_ICON } from './icons.ts'
import { useHasKey, type HuntData } from './useHunt.ts'

interface Props {
  open: boolean
  onClose: () => void
  data: HuntData
  scope: string
  initialStoreId?: string | null
}

export function QuickLog(props: Props) {
  if (!props.open) return null
  return <QuickLogSheet {...props} />
}

type Geo = 'idle' | 'asking' | 'ok' | 'denied' | 'unavailable'

function QuickLogSheet({ onClose, data, scope, initialStoreId }: Props) {
  const { me, people, stores, storeById, byStore, sightings, now } = data
  const canPost = useHasKey()
  const [storeId, setStoreId] = useState<string | null>(initialStoreId && storeById.has(initialStoreId) ? initialStoreId : null)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<LatLng | null>(null)
  const [geo, setGeo] = useState<Geo>('idle')
  const [more, setMore] = useState(false)
  const [picked, setPicked] = useState<SightingResult | null>(null)
  const [items, setItems] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<WhenMode>('now')
  const [time, setTime] = useState(() => clockNow(Date.now()))
  const { data: releases } = useData<ReleaseLite[]>('seed/releases.json')

  const store = storeId ? storeById.get(storeId) : undefined
  const ready = canPost && !!me && !!store

  function locate() {
    if (!('geolocation' in navigator)) {
      setGeo('unavailable')
      return
    }
    setGeo('asking')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude })
        setGeo('ok')
      },
      () => setGeo('denied'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  // If location is already allowed for this site, use it without asking again.
  useEffect(() => {
    if (initialStoreId) return
    try {
      void navigator.permissions?.query({ name: 'geolocation' }).then((s) => {
        if (s.state === 'granted') locate()
      })
    } catch {
      /* permissions API unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allViews = useMemo(() => viewStores(stores, 'both'), [stores])
  const scoped = useMemo(() => sortByMiles(viewStores(stores, scope)), [stores, scope])
  const list: StoreView[] = useMemo(() => {
    const base = pos ? withPosition(allViews, pos) : query ? sortByMiles(allViews) : scoped
    return filterViews(base, { query }).slice(0, query || pos ? 8 : 6)
  }, [allViews, scoped, pos, query])

  const recent = useMemo(() => {
    if (!me) return []
    const seen: string[] = []
    for (const s of [...sightings].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
      if (s.by === me.id && !seen.includes(s.store) && storeById.has(s.store)) seen.push(s.store)
      if (seen.length === 3) break
    }
    return seen.map((id) => storeById.get(id)!).filter((s) => !s.hidden)
  }, [sightings, me, storeById])

  const setChips = useMemo(() => recentSetChips(releases ?? [], now), [releases, now])

  const toggleItem = (name: string) => setItems((cur) => (cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]))

  function save(result: SightingResult) {
    if (!me || !store) return
    const sighting = buildSighting({ id: newId(), by: me.id, store: store.id, result, at: resolveWhen(mode, time, Date.now()), items, note })
    onClose() // the change shows at once; the toast reports the commit
    void withToast(
      () => updateUserFile<Sighting>('sightings', (cur) => [...cur, sighting], sightingMessage(me.name, store.name, result)),
      `Logged ${resultLabel(result).toLowerCase()} at ${store.name}`,
    )
  }

  function tapResult(result: SightingResult) {
    if (!ready) {
      toast(!canPost ? 'Add your posting key in Settings first.' : !me ? 'Pick who you are first (top right).' : 'Pick a store first.', 'error')
      return
    }
    if (more) setPicked(result)
    else save(result)
  }

  const last = store ? byStore.get(store.id)?.[0] : undefined

  return (
    <Sheet
      open
      onClose={onClose}
      title="Log a sighting"
      footer={
        more ? (
          <Button variant="primary" className="w-full min-h-12" disabled={!ready || !picked} onClick={() => picked && save(picked)}>
            {picked ? `Save: ${resultLabel(picked)}` : 'Pick a result to save'}
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <KeyNote canPost={canPost} hasMe={!!me} what="log what you see" />

        {/* 1. where */}
        {store ? (
          <div className="rounded-2xl border border-accent bg-accent-soft p-3">
            <div className="flex items-center gap-3">
              <ChainBadge chain={store.chain} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{store.name}</div>
                <div className="truncate text-[12px] text-ink-2">
                  {store.chain}
                  {store.address ? ` · ${store.address}` : ''}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setStoreId(null)}>
                Change
              </Button>
            </div>
            {last && <p className="mt-2 text-[12px] text-ink-2">Last logged: {sightingLine(last, personName(people, last.by), now)}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Which store?</h3>
              <Button size="sm" variant="secondary" onClick={locate} disabled={geo === 'asking'}>
                <LocateFixed size={15} aria-hidden /> {geo === 'asking' ? 'Locating…' : pos ? 'Update location' : 'Use my location'}
              </Button>
            </div>
            {geo === 'ok' && <p className="-mt-1 text-[12px] text-ink-3">Sorted by where you are. Your location isn't saved.</p>}
            {geo === 'denied' && <p className="-mt-1 text-[12px] text-ink-3">Couldn't get your location (check the browser's permission). Search below instead.</p>}
            {geo === 'unavailable' && <p className="-mt-1 text-[12px] text-ink-3">This browser can't share its location. Search below instead.</p>}
            {!query && recent.length > 0 && (
              <div>
                <div className="mb-1.5 text-[12px] text-ink-3">Your recent stores</div>
                <div className="flex flex-wrap gap-2">
                  {recent.map((s) => (
                    <button key={s.id} type="button" onClick={() => setStoreId(s.id)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pr-3.5 pl-1.5 text-[13px] font-medium hover:border-line-strong">
                      <ChainBadge chain={s.chain} size="sm" />
                      <span className="max-w-44 truncate">{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input aria-label="Find the store" placeholder="Search all stores" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
            </div>
            <ul className="grid grid-cols-1 gap-1.5">
              {list.map((v) => (
                <li key={v.store.id}>
                  <button type="button" onClick={() => setStoreId(v.store.id)} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 text-left hover:border-line-strong active:scale-[0.995]">
                    <ChainBadge chain={v.store.chain} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{v.store.name}</span>
                      <span className="block truncate text-[12px] text-ink-3">{v.store.address ?? v.store.chain}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-ink-2 tabular">{v.miles != null ? `${v.miles.toFixed(1)} mi` : ''}</span>
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-center text-sm text-ink-2">No match. Add the store from the Stores tab.</li>}
            </ul>
          </div>
        )}

        {/* 2. what */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">What did you see?</h3>
          <div className="grid grid-cols-2 gap-2.5">
            {RESULTS.map((r) => {
              const Icon = RESULT_ICON[r.value]
              const on = picked === r.value
              return (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={more ? on : undefined}
                  onClick={() => tapResult(r.value)}
                  className={cx(
                    'flex min-h-[96px] flex-col items-start justify-center gap-0.5 rounded-2xl border px-3.5 py-3 text-left transition active:scale-[0.98]',
                    on ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2 hover:border-line-strong',
                    !ready && 'opacity-60',
                  )}
                >
                  <Icon size={22} aria-hidden className={r.value === 'stocked' ? 'text-up' : r.value === 'empty' ? 'text-down' : r.value === 'restocking' ? 'text-accent' : 'text-ink-2'} />
                  <span className="text-[16px] font-semibold">{r.label}</span>
                  <span className="text-[12px] text-ink-3">{r.hint}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[12px] text-ink-3">{more ? 'Pick a result, then save.' : store ? 'Tap a result to save it.' : 'Pick a store, then tap a result to save it.'}</p>
        </div>

        {/* 3. optional details */}
        <div>
          <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-sm font-medium text-ink-2 hover:text-ink">
            <span>Add items, a note, or another time</span>
            <ChevronDown size={18} aria-hidden className={cx('transition', more && 'rotate-180')} />
          </button>
          {more && (
            <div className="mt-2 grid grid-cols-1 gap-4">
              <div>
                <div className="mb-1.5 text-[13px] font-medium text-ink-2">What was there</div>
                <div className="flex flex-wrap gap-2">
                  {[...ITEM_CHIPS, ...setChips].map((v) => {
                    const on = items.includes(v)
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleItem(v)}
                        className={cx(
                          'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition',
                          on ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface-2 text-ink-2 hover:text-ink',
                        )}
                      >
                        {on && <Check size={14} aria-hidden />}
                        {v}
                      </button>
                    )
                  })}
                </div>
              </div>
              <Field label="Note">
                <Textarea rows={2} placeholder="Limit 2 per person, vendor in aisle 12…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} />
              </Field>
              <div>
                <div className="mb-1.5 text-[13px] font-medium text-ink-2">When</div>
                <Segmented
                  value={mode}
                  onChange={(m) => {
                    setMode(m)
                    if (m === 'earlier') setTime(clockNow(Date.now() - 3_600_000))
                    if (m === 'yesterday') setTime(clockNow(Date.now()))
                  }}
                  options={[
                    { value: 'now', label: 'Just now' },
                    { value: 'earlier', label: 'Earlier today' },
                    { value: 'yesterday', label: 'Yesterday' },
                  ]}
                />
                {mode !== 'now' && (
                  <div className="mt-2.5 max-w-44">
                    <Input type="time" aria-label="Time you saw it" value={time} onChange={(e) => setTime(e.target.value)} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}
