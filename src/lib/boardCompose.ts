// The Board composer's form model: draft <-> post conversion, validation, quick time picks and
// the prefill query other screens link to (#/board?new=deal&product=...&price=...).
import { POST_TYPES } from './board.ts'
import { detectStore, normalizeUrl, suggestTitle } from './boardLinks.ts'
import type { Post, PostType } from './user.ts'

/** Form fields as the inputs hold them (strings; times in datetime-local format). */
export interface Draft {
  type: PostType
  title: string
  url: string
  store: string
  productId: number | undefined
  price: string
  qty: string
  starts: string
  ends: string
  where: string
  note: string
}

export function emptyDraft(type: PostType): Draft {
  return { type, title: '', url: '', store: '', productId: undefined, price: '', qty: '', starts: '', ends: '', where: '', note: '' }
}

// ---------- datetime-local helpers ----------

const p2 = (n: number) => String(n).padStart(2, '0')

/** An instant as the local "YYYY-MM-DDTHH:mm" a datetime-local input uses. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/** A local datetime-local value as an ISO instant, or undefined if blank or malformed. */
export function fromLocalInput(s: string): string | undefined {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return undefined
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export interface QuickPick {
  label: string
  value: string
}

/** One-tap times for the date fields. Closing times lean late ("tonight 11:59 pm"); start times
 *  lean sensible ("tonight 7 pm"). Picks that are already in the past are left out. */
export function quickPicks(now: number, kind: 'start' | 'end'): QuickPick[] {
  const d = new Date(now)
  const at = (addDays: number, hh: number, mm: number) => toLocalInput(new Date(d.getFullYear(), d.getMonth(), d.getDate() + addDays, hh, mm).getTime())
  const toSunday = (7 - d.getDay()) % 7
  const end = kind === 'end'
  const picks: QuickPick[] = [
    { label: 'In 1 hour', value: toLocalInput(now + 3_600_000) },
    end ? { label: 'Tonight 11:59 pm', value: at(0, 23, 59) } : { label: 'Tonight 7 pm', value: at(0, 19, 0) },
    end ? { label: 'Tomorrow 5 pm', value: at(1, 17, 0) } : { label: 'Tomorrow 9 am', value: at(1, 9, 0) },
    end ? { label: 'This Sunday', value: at(toSunday, 23, 59) } : { label: 'This Sunday', value: at(toSunday, 10, 0) },
  ]
  const nowLocal = toLocalInput(now)
  return picks.filter((p) => p.value > nowLocal)
}

/** One-tap end times for an event that starts at `start` (a datetime-local value): 1, 2 or 3 hours
 *  later. Empty until a start time is set. */
export function afterPicks(start: string): QuickPick[] {
  const iso = fromLocalInput(start)
  if (!iso) return []
  const base = Date.parse(iso)
  return [1, 2, 3].map((h) => ({ label: `${h} hour${h > 1 ? 's' : ''} later`, value: toLocalInput(base + h * 3_600_000) }))
}

// ---------- prefill ----------

/** What another screen can pass in the URL to open the composer already filled in. */
export function parsePrefill(params: URLSearchParams): Partial<Draft> | undefined {
  const t = params.get('new')
  if (t == null) return undefined
  const out: Partial<Draft> = { type: (POST_TYPES as string[]).includes(t) ? (t as PostType) : 'deal' }
  const product = Number(params.get('product'))
  if (Number.isInteger(product) && product > 0) out.productId = product
  const price = parsePrice(params.get('price') ?? '')
  if (price != null) out.price = String(price)
  const store = params.get('store')?.trim()
  if (store) out.store = store
  const url = normalizeUrl(params.get('url') ?? '')
  if (url) out.url = url
  const title = params.get('title')?.trim()
  if (title) out.title = title
  const note = params.get('note')?.trim()
  if (note) out.note = note
  const where = params.get('where')?.trim()
  if (where) out.where = where
  for (const key of ['starts', 'ends'] as const) {
    const v = Date.parse(params.get(key) ?? '')
    if (!Number.isNaN(v)) out[key] = toLocalInput(v)
  }
  return out
}

/** A starting draft from a prefill: fills the store and title from the link when they weren't given. */
export function prefillToDraft(pre: Partial<Draft>): Draft {
  const d: Draft = { ...emptyDraft(pre.type ?? 'deal'), ...pre }
  if (d.url) {
    if (!d.store) d.store = detectStore(d.url) ?? ''
    if (!d.title) d.title = suggestTitle(d.url) ?? ''
  }
  return d
}

// ---------- validation ----------

/** "$49.99" or "1,250" -> a number rounded to cents; undefined when empty or not a positive amount. */
export function parsePrice(s: string): number | undefined {
  const cleaned = s.replace(/[$,\s]/g, '')
  if (!cleaned) return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined
}

export type DraftErrors = Partial<Record<'title' | 'url' | 'price' | 'qty' | 'starts' | 'ends', string>>

const usesPrice = (t: PostType) => t === 'deal' || t === 'drop'

export function validateDraft(d: Draft, now: number, opts: { editing?: boolean } = {}): DraftErrors {
  const errors: DraftErrors = {}
  if (!d.title.trim()) errors.title = 'Give it a title.'
  if (d.url.trim() && !normalizeUrl(d.url)) errors.url = "That link doesn't look right. Paste the whole web address."
  if (usesPrice(d.type) && d.price.trim() && parsePrice(d.price) == null) errors.price = 'Enter a price like 49.99.'
  if (d.type === 'deal' && d.qty.trim()) {
    const q = Number(d.qty)
    if (!Number.isInteger(q) || q < 1) errors.qty = 'Use a whole number, 1 or more.'
  }
  const starts = fromLocalInput(d.starts)
  const ends = fromLocalInput(d.ends)
  if (d.type === 'drawing' && !ends) errors.ends = 'Add when entries close.'
  if (d.type === 'drop' && !starts) errors.starts = 'Add when it goes live.'
  if (d.type === 'event' && !starts) errors.starts = 'Add when it starts.'
  if ((d.type === 'drawing' || d.type === 'deal') && ends && !opts.editing && Date.parse(ends) <= now) errors.ends = 'That time has already passed.'
  if (d.type === 'event' && starts && ends && Date.parse(ends) <= Date.parse(starts)) errors.ends = 'The end has to be after the start.'
  return errors
}

// ---------- draft <-> post ----------

export function postToDraft(p: Post): Draft {
  return {
    type: p.type,
    title: p.title,
    url: p.url ?? '',
    store: p.store ?? '',
    productId: p.productId,
    price: p.price != null ? String(p.price) : '',
    qty: p.qty != null ? String(p.qty) : '',
    starts: p.starts ? toLocalInput(Date.parse(p.starts)) : '',
    ends: p.ends ? toLocalInput(Date.parse(p.ends)) : '',
    where: p.where ?? '',
    note: p.note ?? '',
  }
}

/** A tidy Post from the form: empty fields are left out, and fields the type doesn't use are dropped.
 *  When editing, pass the old post so its statuses, archive flag and timestamp carry over. */
export function draftToPost(d: Draft, ctx: { id: string; by: string; now: number; previous?: Post }): Post {
  const t = d.type
  const url = d.url.trim() ? normalizeUrl(d.url) : undefined
  const post: Post = {
    id: ctx.id,
    type: t,
    by: ctx.by,
    at: ctx.previous?.at ?? new Date(ctx.now).toISOString(),
    title: d.title.trim(),
  }
  if (url) post.url = url
  if (d.store.trim()) post.store = d.store.trim()
  if (ctx.previous?.storeId) post.storeId = ctx.previous.storeId
  if (d.productId && (t === 'deal' || t === 'drop' || t === 'drawing')) post.productId = d.productId
  const price = usesPrice(t) ? parsePrice(d.price) : undefined
  if (price != null) post.price = price
  if (t === 'deal' && d.qty.trim()) post.qty = Number(d.qty)
  if (t === 'drop' || t === 'event') {
    const starts = fromLocalInput(d.starts)
    if (starts) post.starts = starts
  }
  if (t === 'drawing' || t === 'deal' || t === 'event') {
    const ends = fromLocalInput(d.ends)
    if (ends) post.ends = ends
  }
  if ((t === 'drop' || t === 'event') && d.where.trim()) post.where = d.where.trim()
  if (d.note.trim()) post.note = d.note.trim()
  if (ctx.previous?.tags) post.tags = ctx.previous.tags
  if (ctx.previous?.status) post.status = ctx.previous.status
  if (ctx.previous?.archived) post.archived = true
  return post
}
