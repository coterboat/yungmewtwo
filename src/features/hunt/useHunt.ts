// Shared data for the Hunt screens: stores, sightings, the pattern models, and who's posting.
import { useEffect, useMemo, useState } from 'react'
import { buildModels, type Models } from '../../lib/hunt.ts'
import { useMe, usePeople } from '../../lib/people.ts'
import { usePrefs } from '../../lib/prefs.ts'
import type { Person, Sighting, Store } from '../../lib/user.ts'
import { useUserFile } from '../../lib/userData.ts'

const NONE: never[] = []

/** Date.now(), refreshed every minute so countdowns and "today" stay honest. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export interface HuntData {
  people: Person[]
  me: Person | undefined
  stores: Store[]
  storeById: Map<string, Store>
  sightings: Sighting[]
  /** Sightings per store id, newest first. */
  byStore: Map<string, Sighting[]>
  models: Models
  now: number
  loading: boolean
  error: string | undefined
}

export function useHuntData(): HuntData {
  const people = usePeople()
  const me = useMe()
  const storesFile = useUserFile<Store>('stores')
  const sightingsFile = useUserFile<Sighting>('sightings')
  const now = useNow()

  const stores = storesFile.data ?? NONE
  const sightings = sightingsFile.data ?? NONE

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores])
  const byStore = useMemo(() => {
    const map = new Map<string, Sighting[]>()
    for (const s of sightings) {
      const list = map.get(s.store)
      if (list) list.push(s)
      else map.set(s.store, [s])
    }
    for (const list of map.values()) list.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    return map
  }, [sightings])
  const models = useMemo(() => buildModels(stores, sightings, now), [stores, sightings, now])

  return {
    people,
    me,
    stores,
    storeById,
    sightings,
    byStore,
    models,
    now,
    loading: storesFile.data === undefined || sightingsFile.data === undefined,
    error: storesFile.error ?? sightingsFile.error,
  }
}

/** True when this device has a posting key (writes commit to the repo). */
export function useHasKey(): boolean {
  return !!usePrefs().token
}
