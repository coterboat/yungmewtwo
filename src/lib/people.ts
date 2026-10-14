// The two of you. people.json in the repo is the source of truth; these defaults cover a fresh repo.
import { usePrefs } from './prefs.ts'
import type { Person } from './user.ts'
import { useUserFile } from './userData.ts'

export const DEFAULT_PEOPLE: Person[] = [
  { id: 'alex', name: 'Alex', area: 'Sandy Springs, GA', color: '#a78bfa' },
  { id: 'paul', name: 'Paul', area: 'Simpsonville, SC', color: '#f5a524' },
]

export function usePeople(): Person[] {
  const { data } = useUserFile<Person>('people')
  return data && data.length ? data : DEFAULT_PEOPLE
}

/** The person viewing on this device, or undefined if they haven't picked. */
export function useMe(): Person | undefined {
  const people = usePeople()
  const { me } = usePrefs()
  return people.find((p) => p.id === me)
}

/** The repo owner: first in people.json. They make posting keys; everyone else gets a join link. */
export function useJoinHint(): string {
  const people = usePeople()
  const me = useMe()
  const owner = people[0]
  if (!owner || me?.id === owner.id) return 'Make one on GitHub; the steps are in Settings.'
  return `Ask ${owner.name} for your join link and it sets itself up.`
}

export function personName(people: Person[], id: string | undefined): string {
  return people.find((p) => p.id === id)?.name ?? id ?? 'Someone'
}
