// Shared, live copies of the data/user/*.json files. With a posting key we read straight from
// GitHub (fresh to the second); without one, from the deployed site (a minute or two behind).
// Writes are optimistic: the change shows at once, then commits with a retry on conflicts.
import { useEffect, useSyncExternalStore } from 'react'
import { loadData } from './data.ts'
import { GitHubError, readRepoFile, writeRepoFile } from './github.ts'
import { getPrefs } from './prefs.ts'
import type { UserFileName } from './user.ts'

interface Entry {
  value: unknown[] | undefined
  error: string | undefined
  saving: number
  loading: Promise<void> | undefined
  listeners: Set<() => void>
  snapshot: FileState<unknown>
}

export interface FileState<T> {
  data: T[] | undefined
  error: string | undefined
  saving: boolean
}

const files = new Map<string, Entry>()

function entry(name: string): Entry {
  let e = files.get(name)
  if (!e) {
    e = { value: undefined, error: undefined, saving: 0, loading: undefined, listeners: new Set(), snapshot: { data: undefined, error: undefined, saving: false } }
    files.set(name, e)
  }
  return e
}

function emit(e: Entry) {
  e.snapshot = { data: e.value, error: e.error, saving: e.saving > 0 }
  e.listeners.forEach((l) => l())
}

const repoPath = (name: string) => `data/user/${name}.json`

function parse(text: string): unknown[] {
  const v = JSON.parse(text) as unknown
  return Array.isArray(v) ? v : []
}

async function fetchFresh(name: string): Promise<{ value: unknown[]; sha?: string }> {
  const token = getPrefs().token
  if (token) {
    const file = await readRepoFile(repoPath(name), token)
    return file ? { value: parse(file.text), sha: file.sha } : { value: [] }
  }
  try {
    return { value: await loadData<unknown[]>(`user/${name}.json`) }
  } catch {
    return { value: [] }
  }
}

export function loadUserFile(name: UserFileName, force = false): Promise<void> {
  const e = entry(name)
  if (e.loading && !force) return e.loading
  e.loading = fetchFresh(name).then(
    ({ value }) => {
      e.value = value
      e.error = undefined
      emit(e)
    },
    (err: Error) => {
      e.error = err.message
      e.value ??= []
      emit(e)
    },
  )
  return e.loading
}

export function useUserFile<T>(name: UserFileName): FileState<T> {
  const e = entry(name)
  useEffect(() => {
    void loadUserFile(name)
  }, [name])
  return useSyncExternalStore(
    (l) => {
      e.listeners.add(l)
      return () => e.listeners.delete(l)
    },
    () => e.snapshot as FileState<T>,
  ) as FileState<T>
}

/** Applies `mutate` to the newest copy on GitHub and commits it. Shows the change immediately. */
export async function updateUserFile<T>(name: UserFileName, mutate: (items: T[]) => T[], message: string): Promise<void> {
  const token = getPrefs().token
  if (!token) throw new GitHubError(401, 'Add your posting key in Settings to post. (Ask Alex for the join link.)')
  const e = entry(name)
  const before = e.value
  e.value = mutate([...((e.value ?? []) as T[])])
  e.saving++
  emit(e)
  try {
    for (let attempt = 0; ; attempt++) {
      const file = await readRepoFile(repoPath(name), token)
      const next = mutate(file ? (parse(file.text) as T[]) : [])
      const text = `[\n${next.map((x) => JSON.stringify(x)).join(',\n')}\n]\n`
      try {
        await writeRepoFile(repoPath(name), text, file?.sha, message, token)
        e.value = next
        e.error = undefined
        return
      } catch (err) {
        // 409/422 = someone else committed between our read and write; re-read and re-apply.
        if (err instanceof GitHubError && (err.status === 409 || err.status === 422) && attempt < 3) continue
        throw err
      }
    }
  } catch (err) {
    e.value = before
    throw err
  } finally {
    e.saving--
    emit(e)
  }
}
