// Per-device preferences in localStorage: who's viewing, their posting key, alert channel,
// theme, and Radar layout. Every read and write is guarded (private mode can throw).
import { useSyncExternalStore } from 'react'

export interface Prefs {
  /** Person id from people.json; decides "my" watchlist/vault and who posts. */
  me: string | null
  /** Fine-grained GitHub token that can write this repo's contents. */
  token: string | null
  /** ntfy topic the pipeline pushes alerts to. */
  ntfyTopic: string | null
  theme: 'system' | 'dark' | 'light'
  /** Radar section ids in display order; missing ids fall back to defaults. */
  radarOrder: string[]
  radarHidden: string[]
  /** When Radar was last viewed (ISO), so newer board posts show as new. */
  radarSeenAt: string | null
  marketLang: 'EN' | 'JP'
}

const KEY = 'yungmewtwo:prefs'
const DEFAULTS: Prefs = { me: null, token: null, ntfyTopic: null, theme: 'system', radarOrder: [], radarHidden: [], radarSeenAt: null, marketLang: 'EN' }

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

let current = read()
const listeners = new Set<() => void>()

export function getPrefs(): Prefs {
  return current
}

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* storage unavailable: keep the in-memory value */
  }
  applyTheme()
  listeners.forEach((l) => l())
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getPrefs,
    getPrefs,
  )
}

export function applyTheme() {
  const t = current.theme
  if (t === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
}

// Another tab changed prefs (e.g. the join link opened in a new tab).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    current = read()
    applyTheme()
    listeners.forEach((l) => l())
  })
}
