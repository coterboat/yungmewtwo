import { describe, expect, it } from 'vitest'
import { addUsage, canonicalPostUrl, costOf, extractJson, readXAnswer, shouldRun, xItemsToNews, xRequestBody } from './xSearch.ts'

// 2026-10-14 18:00 UTC = 2pm Eastern
const now = Date.parse('2026-10-14T18:00:00Z')

describe('shouldRun', () => {
  it('runs first time during the day, not in quiet hours', () => {
    expect(shouldRun({}, now, 3).run).toBe(true)
    expect(shouldRun({}, Date.parse('2026-10-14T05:00:00Z'), 3).run).toBe(false) // 1am ET
  })
  it('waits out the cadence with a little cron slack', () => {
    expect(shouldRun({ lastRun: '2026-10-14T16:00:00Z' }, now, 3).run).toBe(false)
    expect(shouldRun({ lastRun: '2026-10-14T15:05:00Z' }, now, 3).run).toBe(true)
  })
})

describe('request + answer', () => {
  it('asks for x_search from yesterday', () => {
    const body = xRequestBody(now, 3) as { tools: Array<{ type: string; from_date: string }>; model: string }
    expect(body.tools[0]).toEqual({ type: 'x_search', from_date: '2026-10-13' })
    expect(body.model).toBe('grok-4.7')
  })
  it('reads text, citations and usage from a Responses answer', () => {
    const a = readXAnswer({
      output: [
        { type: 'x_search_call', status: 'completed' },
        { type: 'message', content: [{ type: 'output_text', text: '{"items":[]}', annotations: [{ type: 'url_citation', url: 'https://x.com/a/status/1' }] }] },
      ],
      citations: ['https://x.com/b/status/2'],
      usage: { input_tokens: 4000, output_tokens: 600, server_side_tool_usage_details: { x_search_calls: 2, x_posts_fetched: 40, x_users_fetched: 0 } },
    })
    expect(a.text).toBe('{"items":[]}')
    expect(a.citations.sort()).toEqual(['https://x.com/a/status/1', 'https://x.com/b/status/2'])
    expect(a.usage.posts).toBe(40)
    // 4000*2/1e6 + 600*6/1e6 + 40*5/1e3 = 0.008 + 0.0036 + 0.2
    expect(costOf(a.usage)).toBeCloseTo(0.2116, 4)
  })
  it('pulls JSON out of fenced or chatty replies', () => {
    expect(extractJson('Here you go:\n```json\n{"items":[{"title":"a {b}"}]}\n```')).toEqual({ items: [{ title: 'a {b}' }] })
    expect(() => extractJson('nothing here')).toThrow()
  })
})

describe('xItemsToNews', () => {
  const item = (p: object) => ({ title: 'Target restock live', summary: 'ETBs back online at Target, 3am ET drop', url: 'https://twitter.com/PokeRestocks/status/123?s=20', author: '@PokeRestocks', postedAt: '2026-10-14T17:30:00Z', kind: 'restock', retailers: ['Target'], local: false, ...p })
  it('keeps real, cited, recent posts and tags them', () => {
    const [n] = xItemsToNews({ items: [item({})] }, ['https://x.com/PokeRestocks/status/123'], now, 3)
    expect(n.link).toBe('https://x.com/PokeRestocks/status/123')
    expect(n.source).toBe('x')
    expect(n.author).toBe('PokeRestocks')
    expect(n.tags).toEqual(expect.arrayContaining(['restock', 'target']))
  })
  it('drops uncited links, non-post links and stale posts', () => {
    const out = xItemsToNews(
      { items: [item({}), item({ url: 'https://example.com/x' }), item({ url: 'https://x.com/a/status/9', postedAt: '2026-10-10T00:00:00Z' })] },
      ['https://x.com/someone_else/status/1'],
      now,
      3,
    )
    expect(out).toEqual([])
  })
  it('marks local posts', () => {
    const [n] = xItemsToNews({ items: [item({ local: true, kind: 'sighting' })] }, [], now, 3)
    expect(n.tags).toEqual(expect.arrayContaining(['local', 'restock']))
  })
  it('canonicalizes post urls', () => {
    expect(canonicalPostUrl('https://mobile.twitter.com/a_b/status/42/photo/1')).toBe('https://x.com/a_b/status/42')
    expect(canonicalPostUrl('https://x.com/a_b')).toBeNull()
  })
})

describe('addUsage', () => {
  it('rolls spend up by month', () => {
    const u1 = addUsage({}, now, { inputTokens: 1, outputTokens: 1, posts: 10, users: 0 }, 0.05)
    const u2 = addUsage(u1, now, { inputTokens: 1, outputTokens: 1, posts: 20, users: 1 }, 0.11)
    expect(u2['2026-10']).toMatchObject({ runs: 2, posts: 30, users: 1, cost: 0.16 })
  })
})
