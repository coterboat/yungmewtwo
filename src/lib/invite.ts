// The invite ("join") link: #/join?p=<person>&k=<posting key>&t=<alert topic>&a=<card-scan key>. Alex builds one in
// Settings and texts it to the other person; opening it sets up their phone in one tap.
import { cleanTopic } from './ntfySetup.ts'

export interface JoinFields {
  personId: string
  token: string
  topic: string
  /** Anthropic API key for card scanning (scans bill to whoever owns it). */
  scanKey?: string
}

export function buildJoinLink(siteUrl: string, f: JoinFields): string {
  const parts = [`p=${encodeURIComponent(f.personId)}`]
  if (f.token) parts.push(`k=${encodeURIComponent(f.token)}`)
  if (f.topic) parts.push(`t=${encodeURIComponent(f.topic)}`)
  if (f.scanKey) parts.push(`a=${encodeURIComponent(f.scanKey)}`)
  return `${siteUrl}#/join?${parts.join('&')}`
}

export interface JoinParams {
  person?: string
  token?: string
  topic?: string
  scanKey?: string
}

export function parseJoinParams(search: string): JoinParams {
  const q = new URLSearchParams(search)
  const out: JoinParams = {}
  const person = q.get('p')?.trim()
  const token = cleanToken(q.get('k') ?? '')
  const topic = cleanTopic(q.get('t') ?? '')
  if (person) out.person = person
  if (token) out.token = token
  if (topic) out.topic = topic
  const scanKey = cleanToken(q.get('a') ?? '')
  if (scanKey.startsWith('sk-ant-')) out.scanKey = scanKey
  return out
}

/** A key as pasted: no stray whitespace, quotes or "Bearer ". */
export function cleanToken(input: string): string {
  return input
    .trim()
    .replace(/^bearer\s+/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim()
}

/** GitHub keys start with github_pat_ (fine-grained) or ghp_ (classic). */
export function tokenLooksRight(token: string): boolean {
  return /^(?:github_pat_|ghp_|gho_|ghs_)[A-Za-z0-9_]{20,}$/.test(token)
}

/** "github_pat_…mnop": enough to recognize a key without exposing it. */
export function maskToken(token: string): string {
  if (token.length < 20) return '•'.repeat(token.length)
  const prefix = token.match(/^(?:github_pat_|ghp_|gho_|ghs_|sk-ant-)/)?.[0] ?? token.slice(0, 4)
  return `${prefix}…${token.slice(-4)}`
}

/** The join link with its key hidden, for showing on screen. */
export function maskJoinLink(link: string): string {
  return link.replace(/([?&][ka]=)([^&]+)/g, (_m, lead: string, value: string) => {
    let raw = value
    try {
      raw = decodeURIComponent(value)
    } catch {
      /* keep as is */
    }
    return `${lead}${maskToken(raw)}`
  })
}

/** checkToken reports a failed connection with this wording; that's "try again", not "bad key". */
export function isNetworkProblem(message: string): boolean {
  return /couldn'?t reach/i.test(message)
}
