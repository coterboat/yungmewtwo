// Posting = committing a JSON file to the repo through GitHub's Contents API, using the viewer's
// fine-grained token (stored only on their device).
import { REPO } from './config.ts'

const API = 'https://api.github.com'

export class GitHubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

async function fail(res: Response): Promise<never> {
  let msg = res.statusText
  try {
    msg = ((await res.json()) as { message?: string }).message ?? msg
  } catch {
    /* not JSON */
  }
  if (res.status === 401) msg = 'Your posting key was rejected (expired or revoked). Ask Alex for a new join link.'
  if (res.status === 403 || res.status === 404) msg = `GitHub said no (${res.status}): ${msg}. The posting key may not have write access to ${REPO.owner}/${REPO.name}.`
  throw new GitHubError(res.status, msg)
}

/** The file's text and blob sha, or null if it doesn't exist yet. Always fresh (no CDN cache). */
export async function readRepoFile(path: string, token: string): Promise<{ text: string; sha: string } | null> {
  const res = await fetch(`${API}/repos/${REPO.owner}/${REPO.name}/contents/${path}?ref=${REPO.branch}`, { headers: headers(token), cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) await fail(res)
  const body = (await res.json()) as { content: string; sha: string }
  return { text: fromBase64(body.content), sha: body.sha }
}

/** Creates or updates a file in one commit; returns the new blob sha. Conflicts throw status 409. */
export async function writeRepoFile(path: string, text: string, sha: string | undefined, message: string, token: string): Promise<string> {
  const res = await fetch(`${API}/repos/${REPO.owner}/${REPO.name}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: toBase64(text), sha, branch: REPO.branch }),
  })
  if (!res.ok) await fail(res)
  return ((await res.json()) as { content: { sha: string } }).content.sha
}

/** Checks a token before saving it: can it see the repo and push to it? */
export async function checkToken(token: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${API}/repos/${REPO.owner}/${REPO.name}`, { headers: headers(token) })
    if (res.status === 401) return { ok: false, message: 'GitHub rejected that key (typo, expired, or revoked).' }
    if (!res.ok) return { ok: false, message: `GitHub answered ${res.status}. Make sure the key covers ${REPO.owner}/${REPO.name}.` }
    const repo = (await res.json()) as { permissions?: { push?: boolean } }
    // Fine-grained tokens report the owner's permissions here, so also try a harmless read of contents.
    if (repo.permissions && !repo.permissions.push) return { ok: false, message: 'That key can read the repo but not write to it. It needs Contents: Read and write.' }
    return { ok: true, message: 'Posting key works.' }
  } catch {
    return { ok: false, message: "Couldn't reach GitHub. Check your connection." }
  }
}
