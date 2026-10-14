import { describe, expect, it } from 'vitest'
import { afterPicks, draftToPost, emptyDraft, fromLocalInput, parsePrefill, postToDraft, prefillToDraft, quickPicks, toLocalInput, validateDraft } from './boardCompose.ts'

// Local-time constructors keep these tests the same in any time zone.
const NOW = new Date(2026, 9, 14, 15, 30).getTime() // Wed Oct 14 2026, 3:30 pm

describe('local datetime inputs', () => {
  it('round-trips through the datetime-local format', () => {
    const d = new Date(2026, 9, 14, 17, 5)
    expect(toLocalInput(d.getTime())).toBe('2026-10-14T17:05')
    expect(fromLocalInput('2026-10-14T17:05')).toBe(d.toISOString())
  })
  it('returns undefined for blank or broken input', () => {
    expect(fromLocalInput('')).toBeUndefined()
    expect(fromLocalInput('nope')).toBeUndefined()
  })
})

describe('quickPicks', () => {
  it('offers in an hour, tonight, tomorrow and Sunday for closing times', () => {
    const picks = quickPicks(NOW, 'end')
    expect(picks.map((p) => p.label)).toEqual(['In 1 hour', 'Tonight 11:59 pm', 'Tomorrow 5 pm', 'This Sunday'])
    expect(picks[0].value).toBe(toLocalInput(NOW + 3_600_000))
    expect(picks[1].value).toBe('2026-10-14T23:59')
    expect(picks[2].value).toBe('2026-10-15T17:00')
    expect(picks[3].value).toBe('2026-10-18T23:59')
  })
  it('picks a morning time on Sunday when something starts', () => {
    expect(quickPicks(NOW, 'start')[3].value).toBe('2026-10-18T10:00')
  })
  it('means today when today is Sunday', () => {
    const sunday = new Date(2026, 9, 18, 9, 0).getTime()
    expect(quickPicks(sunday, 'end')[3].value).toBe('2026-10-18T23:59')
  })
})

describe('afterPicks', () => {
  it('offers 1, 2 and 3 hours after the start', () => {
    const picks = afterPicks('2026-10-18T13:00')
    expect(picks.map((p) => p.label)).toEqual(['1 hour later', '2 hours later', '3 hours later'])
    expect(picks.map((p) => p.value)).toEqual(['2026-10-18T14:00', '2026-10-18T15:00', '2026-10-18T16:00'])
  })
  it('offers nothing until there is a start', () => {
    expect(afterPicks('')).toEqual([])
  })
})

describe('parsePrefill', () => {
  it('reads a deal link from another screen', () => {
    const p = parsePrefill(new URLSearchParams('new=deal&product=12345&price=49.99&store=Target&url=https%3A%2F%2Ftarget.com%2Fp%2Fx&title=Prismatic%20ETB'))
    expect(p).toEqual({ type: 'deal', productId: 12345, price: '49.99', store: 'Target', url: 'https://target.com/p/x', title: 'Prismatic ETB' })
  })
  it('returns nothing without new=', () => {
    expect(parsePrefill(new URLSearchParams('product=1'))).toBeUndefined()
  })
  it('falls back to a deal for an unknown type and ignores junk', () => {
    expect(parsePrefill(new URLSearchParams('new=1&product=abc&price=-3'))).toEqual({ type: 'deal' })
    expect(parsePrefill(new URLSearchParams('new=drawing&url=javascript:alert(1)'))).toEqual({ type: 'drawing' })
  })
})

describe('validateDraft', () => {
  const ok = { ...emptyDraft('deal'), title: 'ETB at Target', price: '49.99' }
  it('needs a title', () => {
    expect(validateDraft({ ...ok, title: '  ' }, NOW).title).toBeTruthy()
    expect(validateDraft(ok, NOW)).toEqual({})
  })
  it('needs an end for a drawing, and not in the past', () => {
    const d = { ...emptyDraft('drawing'), title: 'Wed drawing' }
    expect(validateDraft(d, NOW).ends).toMatch(/close/i)
    expect(validateDraft({ ...d, ends: toLocalInput(NOW - 60_000) }, NOW).ends).toMatch(/passed/i)
    expect(validateDraft({ ...d, ends: toLocalInput(NOW + 3_600_000) }, NOW)).toEqual({})
  })
  it('needs a start for drops and events', () => {
    expect(validateDraft({ ...emptyDraft('drop'), title: 'Restock' }, NOW).starts).toBeTruthy()
    expect(validateDraft({ ...emptyDraft('event'), title: 'League' }, NOW).starts).toBeTruthy()
  })
  it('rejects an end before the start', () => {
    const d = { ...emptyDraft('event'), title: 'League', starts: '2026-10-20T18:00', ends: '2026-10-20T17:00' }
    expect(validateDraft(d, NOW).ends).toMatch(/after/i)
  })
  it('checks price, quantity and link when filled in', () => {
    expect(validateDraft({ ...ok, price: 'abc' }, NOW).price).toBeTruthy()
    expect(validateDraft({ ...ok, price: '-5' }, NOW).price).toBeTruthy()
    expect(validateDraft({ ...ok, qty: '0' }, NOW).qty).toBeTruthy()
    expect(validateDraft({ ...ok, url: 'javascript:alert(1)' }, NOW).url).toBeTruthy()
    expect(validateDraft({ ...ok, price: '$49.99', qty: '2', url: 'https://target.com/p/x' }, NOW)).toEqual({})
  })
  it('allows past times when editing', () => {
    const d = { ...emptyDraft('drawing'), title: 'Old', ends: toLocalInput(NOW - 3_600_000) }
    expect(validateDraft(d, NOW, { editing: true })).toEqual({})
  })
})

describe('draftToPost', () => {
  it('builds a tidy deal without empty fields', () => {
    const post = draftToPost(
      { ...emptyDraft('deal'), title: ' ETB at Target ', price: '$49.99', qty: '2', store: 'Target', url: 'https://target.com/p/x', productId: 777, note: '  limit 2 ' },
      { id: 'abc', by: 'alex', now: NOW },
    )
    expect(post).toEqual({
      id: 'abc',
      type: 'deal',
      by: 'alex',
      at: new Date(NOW).toISOString(),
      title: 'ETB at Target',
      url: 'https://target.com/p/x',
      store: 'Target',
      productId: 777,
      price: 49.99,
      qty: 2,
      note: 'limit 2',
    })
  })
  it('keeps times only where the type uses them', () => {
    const d = { ...emptyDraft('note'), title: 'hi', starts: '2026-10-20T18:00', ends: '2026-10-20T19:00', price: '5', where: 'x' }
    const post = draftToPost(d, { id: 'n', by: 'alex', now: NOW })
    expect(post.starts).toBeUndefined()
    expect(post.ends).toBeUndefined()
    expect(post.price).toBeUndefined()
    expect(post.where).toBeUndefined()
  })
  it('stores times as ISO instants', () => {
    const post = draftToPost({ ...emptyDraft('drawing'), title: 'D', ends: '2026-10-17T20:00' }, { id: 'd', by: 'alex', now: NOW })
    expect(post.ends).toBe(new Date(2026, 9, 17, 20, 0).toISOString())
  })
  it('keeps what an edit should not change', () => {
    const prev = { id: 'keep', type: 'drawing' as const, by: 'paul', at: '2026-10-01T00:00:00.000Z', title: 'Old', status: { alex: 'in' }, archived: true }
    const post = draftToPost({ ...postToDraft(prev), title: 'New' }, { id: prev.id, by: prev.by, now: NOW, previous: prev })
    expect(post.at).toBe(prev.at)
    expect(post.status).toEqual({ alex: 'in' })
    expect(post.archived).toBe(true)
    expect(post.title).toBe('New')
  })
})

describe('postToDraft', () => {
  it('turns a stored post back into form fields', () => {
    const d = postToDraft({ id: 'a', type: 'deal', by: 'alex', at: 'x', title: 'T', price: 12.5, qty: 3, ends: new Date(2026, 9, 17, 20, 0).toISOString(), productId: 9 })
    expect(d.price).toBe('12.5')
    expect(d.qty).toBe('3')
    expect(d.ends).toBe('2026-10-17T20:00')
    expect(d.productId).toBe(9)
    expect(d.url).toBe('')
  })
})

describe('prefillToDraft', () => {
  it('fills the store and title from the link when they are missing', () => {
    const d = prefillToDraft({ type: 'deal', url: 'https://www.target.com/p/pokemon-tcg-elite-trainer-box/-/A-1', price: '49.99' })
    expect(d.store).toBe('Target')
    expect(d.title).toBe('Pokémon TCG Elite Trainer Box')
    expect(d.price).toBe('49.99')
  })
  it('keeps what was passed in', () => {
    const d = prefillToDraft({ type: 'deal', url: 'https://www.target.com/p/x-y/-/A-1', store: 'Target Roswell', title: 'My title' })
    expect(d.store).toBe('Target Roswell')
    expect(d.title).toBe('My title')
  })
  it('defaults to an empty deal', () => {
    expect(prefillToDraft({})).toEqual(emptyDraft('deal'))
  })
})
