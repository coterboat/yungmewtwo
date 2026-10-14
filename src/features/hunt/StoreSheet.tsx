// One store: what the log says, the weekday x time grid, the timeline, directions, hide.
import { EyeOff, MapPin, Navigation, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast, withToast } from '../../components/toast.tsx'
import { Badge, Button, Section, Sheet } from '../../components/ui.tsx'
import { useData } from '../../lib/data.ts'
import { ago } from '../../lib/format.ts'
import { bestDay, bestWindow, buildGrid, confidence, storeStatus, visitsText } from '../../lib/hunt.ts'
import { chainMeta, type RetailIntel } from '../../lib/huntChains.ts'
import { appleMapsUrl, hasCoords, mapsUrl } from '../../lib/huntStores.ts'
import { personName } from '../../lib/people.ts'
import type { Sighting, Store } from '../../lib/user.ts'
import { updateUserFile } from '../../lib/userData.ts'
import { ChainBadge, KeyNote, LinkButton, PersonDot, ResultBadge } from './bits.tsx'
import { HeatGrid } from './HeatGrid.tsx'
import { useHasKey, type HuntData } from './useHunt.ts'

interface Props {
  store: Store | undefined
  data: HuntData
  onClose: () => void
  onLog: (storeId: string) => void
  onIntel: (retailer: string) => void
}

export function StoreSheet({ store, data, onClose, onLog, onIntel }: Props) {
  return (
    <Sheet open={!!store} onClose={onClose} title={store?.name ?? ''} wide>
      {store && <StoreBody store={store} data={data} onClose={onClose} onLog={onLog} onIntel={onIntel} />}
    </Sheet>
  )
}

function StoreBody({ store, data, onClose, onLog, onIntel }: Omit<Props, 'store'> & { store: Store }) {
  const { people, me, now } = data
  const canPost = useHasKey()
  const sightings = data.byStore.get(store.id) ?? []
  const grid = data.models.store.get(store.id) ?? buildGrid([], now)
  const chainGrid = data.models.chain.get(store.chain)
  const status = storeStatus(sightings)
  const best = bestWindow(grid)
  const day = best ? null : bestDay(grid)
  const conf = confidence(status.n)
  const { data: intel } = useData<RetailIntel[]>('seed/retail.json')
  const retailer = chainMeta(store.chain).intel
  const entry = intel?.find((r) => r.retailer === retailer)
  const [all, setAll] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)

  const chainBest = chainGrid ? bestWindow(chainGrid) : null
  const dists = Object.entries(store.dist ?? {})

  function hide() {
    if (!canPost || !me) {
      toast('Add your posting key in Settings to hide stores.', 'error')
      return
    }
    onClose()
    void withToast(
      () => updateUserFile<Store>('stores', (cur) => cur.map((s) => (s.id === store.id ? { ...s, hidden: true } : s)), `hunt: ${me.name} hid ${store.name}`),
      `Hid ${store.name}. You can unhide it from the Stores tab.`,
    )
  }

  function remove(s: Sighting) {
    if (!canPost || !me) return
    setConfirm(null)
    void withToast(
      () => updateUserFile<Sighting>('sightings', (cur) => cur.filter((x) => x.id !== s.id), `hunt: ${me.name} removed a sighting at ${store.name}`),
      'Sighting removed',
    )
  }

  const timeline = all ? sightings : sightings.slice(0, 8)

  return (
    <div className="grid grid-cols-1 gap-6">
      {/* who and where */}
      <div className="flex items-start gap-3.5">
        <ChainBadge chain={store.chain} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ink-2">{store.chain}</p>
          {store.address && <p className="text-sm text-ink-2">{store.address}</p>}
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            {dists.length ? dists.map(([id, m]) => `${m.toFixed(1)} mi from ${personName(people, id)}`).join(' · ') : 'Distance unknown'}
            {store.source === 'user' && ' · added by hand'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => onLog(store.id)}>
          <Plus size={18} aria-hidden /> Log a sighting here
        </Button>
        <LinkButton href={mapsUrl(store)}>
          <Navigation size={16} aria-hidden /> Directions
        </LinkButton>
        <LinkButton href={appleMapsUrl(store)}>
          <MapPin size={16} aria-hidden /> Apple Maps
        </LinkButton>
      </div>
      {!hasCoords(store) && <p className="-mt-3 text-[12.5px] text-ink-3">No map pin for this store, so directions search by name and address.</p>}

      {/* what we've learned */}
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold">What your log says</h3>
          <Badge tone={conf.level === 'solid' || conf.level === 'fair' ? 'good' : 'neutral'}>
            {conf.label}
            {status.n > 0 ? ` · ${status.n} ${status.n === 1 ? 'sighting' : 'sightings'}` : ''}
          </Badge>
        </div>
        {status.n === 0 ? (
          <p className="text-sm text-ink-2">
            No visits logged here yet. Patterns need about 3 sightings per store.
            {chainBest && ` Meanwhile, across the ${store.chain} stores you've logged: ${chainBest.label.toLowerCase()} have had stock (${visitsText(chainBest.hits, chainBest.n)}).`}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 text-sm">
            {best ? (
              <p className="text-[15px]">
                <span className="font-semibold">Usually stocked: {best.label}</span> <span className="text-ink-2">({visitsText(best.hits, best.n)})</span>
              </p>
            ) : day ? (
              <p className="text-[15px]">
                <span className="font-semibold">Usually stocked: {day.label}</span> <span className="text-ink-2">({visitsText(day.hits, day.n)}, any time of day)</span>
              </p>
            ) : (
              <p className="text-[15px] text-ink-2">No clear window yet: {visitsText(status.hits, status.n)} had stock.</p>
            )}
            {status.n < 3 && <p className="text-ink-2">That's a hunch, not a pattern. It firms up after about 3 sightings.</p>}
            <ul className="mt-1 grid grid-cols-1 gap-1 text-ink-2">
              {status.lastStocked ? <li>Last stocked: {ago(status.lastStocked.at, now)} ({personName(people, status.lastStocked.by)})</li> : <li>Never seen stocked in {status.n} {status.n === 1 ? 'visit' : 'visits'}.</li>}
              {status.lastRestock && <li>Last restock caught live: {ago(status.lastRestock.at, now)}</li>}
              {status.streak && status.streak.count >= 2 && (
                <li>{status.streak.kind === 'empty' ? `Empty on the last ${status.streak.count} visits.` : `Had stock on the last ${status.streak.count} visits in a row.`}</li>
              )}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[15px] font-semibold">When it has stock</h3>
        <HeatGrid grid={grid} />
      </section>

      {/* timeline */}
      <section>
        <h3 className="mb-2 text-[15px] font-semibold">Timeline</h3>
        {sightings.length === 0 ? (
          <p className="text-sm text-ink-2">Nothing yet. The first sighting starts the timeline.</p>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-2">
              {timeline.map((s) => {
                const who = people.find((p) => p.id === s.by)
                const mine = s.by === me?.id
                return (
                  <li key={s.id} className="rounded-xl border border-line bg-surface-2 py-2.5 pr-2 pl-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <ResultBadge result={s.result} />
                          <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
                            <PersonDot person={who} /> {personName(people, s.by)}
                          </span>
                          <span className="text-[12px] text-ink-3">{ago(s.at, now)}</span>
                        </div>
                        <p className="mt-1 text-[13px] text-ink-2">
                          {new Date(s.at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                        {(s.items?.length || s.note) && (
                          <p className="mt-1 text-[13px] text-ink-2">
                            {s.items?.length ? <span className="font-medium">{s.items.join(', ')}</span> : null}
                            {s.items?.length && s.note ? ' · ' : ''}
                            {s.note}
                          </p>
                        )}
                      </div>
                      {mine &&
                        (confirm === s.id ? (
                          <span className="flex shrink-0 items-center gap-1">
                            <Button size="sm" variant="danger" onClick={() => remove(s)}>
                              Delete
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                              Keep
                            </Button>
                          </span>
                        ) : (
                          <button type="button" aria-label="Delete this sighting" onClick={() => setConfirm(s.id)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-down">
                            <Trash2 size={16} aria-hidden />
                          </button>
                        ))}
                    </div>
                  </li>
                )
              })}
            </ul>
            {sightings.length > 8 && !all && (
              <Button className="mt-2" size="sm" onClick={() => setAll(true)}>
                Show all {sightings.length}
              </Button>
            )}
          </>
        )}
      </section>

      {/* reported intel */}
      {entry && (
        <Section title={`What's reported about ${retailer}`} sub={`As of ${entry.asOf}. Secondhand and mostly low-confidence; your log above is the real signal.`} className="mb-0">
          <ul className="grid grid-cols-1 gap-1.5 text-sm text-ink-2">
            {[...entry.limits.slice(0, 1), ...entry.patterns.slice(0, 2)].map((line, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                {line}
              </li>
            ))}
          </ul>
          <Button className="mt-3" size="sm" onClick={() => entry && onIntel(entry.retailer)}>
            Full store intel
          </Button>
        </Section>
      )}

      <div className="border-t border-line pt-4">
        <KeyNote canPost={canPost} hasMe={!!me} what="hide stores or remove sightings" />
        <div className={canPost && me ? '' : 'mt-3'}>
          <Button variant="danger" onClick={hide}>
            <EyeOff size={16} aria-hidden /> Hide this store
          </Button>
          <p className="mt-1.5 text-[12px] text-ink-3">Hidden stores drop out of lists and best bets. You can bring them back from the Stores tab.</p>
        </div>
      </div>
    </div>
  )
}
