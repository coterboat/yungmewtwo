// Hunt: log what you see in a store, learn each store's restock rhythm, and keep weekly reminders.
import { MapPin, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, ErrorNote, PageHeader, Segmented, Skeleton } from '../../components/ui.tsx'
import { AddStore } from './AddStore.tsx'
import { Intel } from './Intel.tsx'
import { QuickLog } from './QuickLog.tsx'
import { Reminders } from './Reminders.tsx'
import { StoreList } from './StoreList.tsx'
import { StoreSheet } from './StoreSheet.tsx'
import { Today } from './Today.tsx'
import { useHuntData } from './useHunt.ts'

type Tab = 'today' | 'stores' | 'intel' | 'reminders'

const SCOPE_KEY = 'yungmewtwo:hunt:scope'

function readScope(): string | null {
  try {
    return localStorage.getItem(SCOPE_KEY)
  } catch {
    return null
  }
}

export default function HuntPage() {
  const data = useHuntData()
  const { people, me } = data
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('today')
  const [picked, setPicked] = useState<string | null>(readScope)
  const [logOpen, setLogOpen] = useState(false)
  const [logStore, setLogStore] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [intelFocus, setIntelFocus] = useState<string | null>(null)

  // Deep links from elsewhere: #/hunt?log=1 opens the quick log, #/hunt?store=<id> opens a store.
  useEffect(() => {
    const log = params.get('log')
    const store = params.get('store')
    if (!log && !store) return
    // The URL is the external system here: a link elsewhere in the app opens a sheet, then we tidy it away.
    /* oxlint-disable react/set-state-in-effect */
    if (log) {
      setDetail(null)
      setLogStore(store)
      setLogOpen(true)
    } else {
      setDetail(store)
    }
    /* oxlint-enable react/set-state-in-effect */
    setParams({}, { replace: true })
  }, [params, setParams])

  // "Near me" first, then the other people, then both.
  const options = useMemo(() => {
    const ordered = me ? [me, ...people.filter((p) => p.id !== me.id)] : people
    return [
      ...ordered.map((p) => ({ value: p.id, label: p.id === me?.id ? 'Near me' : `Near ${p.name}` })),
      { value: 'both', label: 'Both' },
    ]
  }, [people, me])
  const scope = picked && options.some((o) => o.value === picked) ? picked : (me?.id ?? people[0]?.id ?? 'both')
  const scopeLabel = scope === 'both' ? 'Near both of you' : scope === me?.id ? 'Near you' : `Near ${people.find((p) => p.id === scope)?.name ?? 'them'}`

  function pickScope(v: string) {
    setPicked(v)
    try {
      localStorage.setItem(SCOPE_KEY, v)
    } catch {
      /* private mode: the choice just won't stick */
    }
  }

  const openLog = (storeId: string | null = null) => {
    setDetail(null)
    setLogStore(storeId)
    setLogOpen(true)
  }

  const detailStore = detail ? data.storeById.get(detail) : undefined

  return (
    <div className="pb-24 lg:pb-8">
      <PageHeader
        title="Hunt"
        sub="Log what you see in a store; over a few weeks it learns when each one gets stocked."
        action={
          <div className="hidden lg:block">
            <Button variant="primary" className="min-h-12 px-5" onClick={() => openLog()}>
              <Plus size={18} aria-hidden /> Log a sighting
            </Button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'stores', label: 'Stores' },
            { value: 'intel', label: 'Store intel' },
            { value: 'reminders', label: 'Reminders' },
          ]}
        />
        {(tab === 'today' || tab === 'stores') && <Segmented value={scope} onChange={pickScope} options={options} />}
      </div>

      {data.error && <div className="mb-4"><ErrorNote>Couldn't load the latest data ({data.error}). What you see may be out of date.</ErrorNote></div>}

      {data.loading && tab !== 'intel' && tab !== 'reminders' ? (
        <div className="grid grid-cols-1 gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <>
          {tab === 'today' && <Today data={data} scope={scope} scopeLabel={scopeLabel} onOpen={setDetail} onLog={() => openLog()} />}
          {tab === 'stores' && <StoreList data={data} scope={scope} onOpen={setDetail} onAdd={() => setAdding(true)} />}
          {tab === 'intel' && <Intel key={intelFocus ?? 'default'} data={data} focus={intelFocus} />}
          {tab === 'reminders' && <Reminders data={data} />}
        </>
      )}

      <button
        type="button"
        onClick={() => openLog()}
        className="fixed right-4 bottom-[calc(88px+env(safe-area-inset-bottom))] z-40 inline-flex min-h-14 items-center gap-2 rounded-full bg-accent px-6 text-[16px] font-semibold text-accent-ink shadow-2xl transition active:scale-[0.97] lg:hidden"
      >
        <MapPin size={20} aria-hidden /> Log a sighting
      </button>

      <QuickLog open={logOpen} onClose={() => setLogOpen(false)} data={data} scope={scope} initialStoreId={logStore} />
      <StoreSheet
        store={detailStore}
        data={data}
        onClose={() => setDetail(null)}
        onLog={(id) => openLog(id)}
        onIntel={(retailer) => {
          setDetail(null)
          setIntelFocus(retailer)
          setTab('intel')
        }}
      />
      <AddStore open={adding} onClose={() => setAdding(false)} data={data} onAdded={(id) => setDetail(id)} />
    </div>
  )
}
