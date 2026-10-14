// Add a store by hand (a local card shop OSM doesn't know, a pop-up, a store in a new town).
import { useState } from 'react'
import { withToast } from '../../components/toast.tsx'
import { Button, Field, Input, Select, Sheet } from '../../components/ui.tsx'
import { CHAIN_META } from '../../lib/huntChains.ts'
import { LOCAL_SHOP } from '../../lib/huntOsm.ts'
import { customStore, parseLatLng } from '../../lib/huntStores.ts'
import type { Store } from '../../lib/user.ts'
import { updateUserFile } from '../../lib/userData.ts'
import { KeyNote } from './bits.tsx'
import { useHasKey, type HuntData } from './useHunt.ts'

const OTHER = '__other'

export function AddStore({ open, onClose, data, onAdded }: { open: boolean; onClose: () => void; data: HuntData; onAdded: (id: string) => void }) {
  if (!open) return null
  return <AddStoreSheet onClose={onClose} data={data} onAdded={onAdded} />
}

function AddStoreSheet({ onClose, data, onAdded }: { onClose: () => void; data: HuntData; onAdded: (id: string) => void }) {
  const canPost = useHasKey()
  const { me, people } = data
  const [name, setName] = useState('')
  const [chain, setChain] = useState(LOCAL_SHOP)
  const [other, setOther] = useState('')
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState('')
  const [dist, setDist] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  function save() {
    const finalChain = chain === OTHER ? other.trim() : chain
    if (!name.trim()) return setError('Give the store a name.')
    if (!finalChain) return setError('Type the chain or shop type.')
    const point = coords.trim() ? parseLatLng(coords) : null
    if (coords.trim() && !point) return setError('Coordinates should look like 33.9795, -84.3411 (copy them from a map app).')
    const miles: Record<string, number> = {}
    for (const [id, v] of Object.entries(dist)) {
      if (!v.trim()) continue
      const n = Number(v)
      if (!Number.isFinite(n) || n < 0) return setError('Distances should be numbers of miles, like 4.5.')
      miles[id] = Math.round(n * 10) / 10
    }
    if (!canPost || !me) return
    const store = customStore({ name, chain: finalChain, address, coords: point, dist: miles })
    onClose()
    void withToast(
      () => updateUserFile<Store>('stores', (cur) => (cur.some((s) => s.id === store.id) ? cur : [...cur, store]), `hunt: ${me.name} added ${store.name}`),
      `Added ${store.name}`,
    )
    onAdded(store.id)
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add a store"
      footer={
        <Button variant="primary" className="w-full min-h-12" disabled={!canPost || !me} onClick={save}>
          Add store
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <KeyNote canPost={canPost} hasMe={!!me} what="add stores" />
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Card Haven" maxLength={80} />
        </Field>
        <Field label="Chain or type">
          <Select value={chain} onChange={(e) => setChain(e.target.value)}>
            {CHAIN_META.map((m) => (
              <option key={m.chain} value={m.chain}>
                {m.chain === LOCAL_SHOP ? 'Local card or game shop' : m.chain}
              </option>
            ))}
            <option value={OTHER}>Something else…</option>
          </Select>
        </Field>
        {chain === OTHER && (
          <Field label="Chain or shop type">
            <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Meijer, flea market, card show…" maxLength={40} />
          </Field>
        )}
        <Field label="Address" hint="Optional. Street and town is plenty.">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Roswell, GA" maxLength={120} />
        </Field>
        <Field label="Map coordinates" hint="Optional, for directions and sorting by where you are. In Google Maps, press and hold a spot and copy the numbers.">
          <Input value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="33.9795, -84.3411" inputMode="decimal" />
        </Field>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-ink-2">Roughly how far (miles)?</div>
          <div className="grid grid-cols-2 gap-3">
            {people.map((p) => (
              <label key={p.id} className="block">
                <span className="mb-1 block text-[12px] text-ink-3">From {p.name}</span>
                <Input type="number" inputMode="decimal" min={0} step={0.1} value={dist[p.id] ?? ''} onChange={(e) => setDist((cur) => ({ ...cur, [p.id]: e.target.value }))} placeholder="Optional" />
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-ink-3">Leave blank and the store shows up for everyone, with no distance.</p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-down">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  )
}
