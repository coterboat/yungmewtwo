import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const DATA = resolve(ROOT, 'data')
export const PUBLIC_DATA = resolve(ROOT, 'public', 'data')

export const USER_AGENT = 'yungmewtwo/0.1 (+https://github.com/coterboat/yungmewtwo; personal collection tracker)'

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

/** Writes JSON with one array element / object entry per line, so git diffs stay readable. */
export async function writeLines(path: string, value: unknown[] | Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const body = Array.isArray(value)
    ? `[\n${value.map((v) => JSON.stringify(v)).join(',\n')}\n]\n`
    : `{\n${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n')}\n}\n`
  await writeFile(path, body)
}

export async function writeJson(path: string, value: unknown, pretty = true): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, (pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)) + '\n')
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function fetchWithRetry(url: string, init: RequestInit = {}, tries = 3): Promise<Response> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(30_000),
      })
      if (res.ok || res.status === 304 || (res.status >= 400 && res.status < 500 && res.status !== 429)) return res
      last = new Error(`${res.status} ${res.statusText} for ${url}`)
    } catch (err) {
      last = err
    }
    await sleep(1000 * 2 ** i)
  }
  throw last
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url)
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  return (await res.json()) as T
}

export const todayUtc = () => new Date().toISOString().slice(0, 10)
