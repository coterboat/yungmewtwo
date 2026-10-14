import { describe, expect, it } from 'vitest'
import { buildJoinLink, cleanToken, isNetworkProblem, maskJoinLink, maskToken, parseJoinParams, tokenLooksRight } from './invite.ts'

const SITE = 'https://coterboat.github.io/yungmewtwo/'

describe('buildJoinLink', () => {
  it('builds the link with person, key and topic', () => {
    expect(buildJoinLink(SITE, { personId: 'paul', token: 'github_pat_ABC123', topic: 'yungmewtwo-abc' })).toBe(
      'https://coterboat.github.io/yungmewtwo/#/join?p=paul&k=github_pat_ABC123&t=yungmewtwo-abc',
    )
  })
  it('leaves out what is missing', () => {
    expect(buildJoinLink(SITE, { personId: 'paul', token: '', topic: 'x' })).toBe('https://coterboat.github.io/yungmewtwo/#/join?p=paul&t=x')
    expect(buildJoinLink(SITE, { personId: 'paul', token: 'k', topic: '' })).toBe('https://coterboat.github.io/yungmewtwo/#/join?p=paul&k=k')
  })
  it('escapes odd characters', () => {
    expect(buildJoinLink(SITE, { personId: 'a b', token: 'x&y', topic: '' })).toBe('https://coterboat.github.io/yungmewtwo/#/join?p=a%20b&k=x%26y')
  })
})

describe('parseJoinParams', () => {
  it('reads a query string', () => {
    expect(parseJoinParams('?p=paul&k=github_pat_ABC&t=yungmewtwo-abc')).toEqual({ person: 'paul', token: 'github_pat_ABC', topic: 'yungmewtwo-abc' })
  })
  it('round-trips with buildJoinLink', () => {
    const link = buildJoinLink(SITE, { personId: 'alex', token: 'github_pat_11A_b', topic: 'topic_1' })
    expect(parseJoinParams(link.slice(link.indexOf('?')))).toEqual({ person: 'alex', token: 'github_pat_11A_b', topic: 'topic_1' })
  })
  it('cleans the values and ignores junk topics', () => {
    expect(parseJoinParams('?p= paul &k=%20abc%20&t=not%20a%20topic!')).toEqual({ person: 'paul', token: 'abc' })
  })
  it('returns an empty object when nothing is there', () => {
    expect(parseJoinParams('')).toEqual({})
  })
})

describe('cleanToken', () => {
  it('trims whitespace, quotes and a Bearer prefix', () => {
    expect(cleanToken('  github_pat_ABC\n')).toBe('github_pat_ABC')
    expect(cleanToken('"github_pat_ABC"')).toBe('github_pat_ABC')
    expect(cleanToken('Bearer github_pat_ABC')).toBe('github_pat_ABC')
  })
})

describe('tokenLooksRight', () => {
  it('expects a github key', () => {
    expect(tokenLooksRight(`github_pat_${'A'.repeat(40)}`)).toBe(true)
    expect(tokenLooksRight(`ghp_${'A'.repeat(36)}`)).toBe(true)
    expect(tokenLooksRight('hello world')).toBe(false)
    expect(tokenLooksRight('')).toBe(false)
  })
})

describe('masking', () => {
  it('hides the middle of a key', () => {
    expect(maskToken('github_pat_11ABCDEFG0abcdefghijklmnop')).toBe('github_pat_…mnop')
    expect(maskToken('short')).toBe('•••••')
  })
  it('hides the key inside a join link', () => {
    const link = buildJoinLink(SITE, { personId: 'paul', token: 'github_pat_11ABCDEFG0abcdefghijklmnop', topic: 'topic-1' })
    const masked = maskJoinLink(link)
    expect(masked).not.toContain('11ABCDEFG0')
    expect(masked).toContain('k=github_pat_…mnop')
    expect(masked).toContain('p=paul')
    expect(masked).toContain('t=topic-1')
  })
})

describe('isNetworkProblem', () => {
  it('recognizes the offline message from the token check', () => {
    expect(isNetworkProblem("Couldn't reach GitHub. Check your connection.")).toBe(true)
    expect(isNetworkProblem('GitHub rejected that key (typo, expired, or revoked).')).toBe(false)
  })
})

describe('card-scan key in the join link', () => {
  it('round-trips and masks the Anthropic key', () => {
    const link = buildJoinLink('https://x.test/', { personId: 'paul', token: 'github_pat_abcdefghijklmnopqrstuvwxyz', topic: 'topic-1', scanKey: 'sk-ant-api03-abcdefghijklmnopqrstuv' })
    const parsed = parseJoinParams(link.split('?')[1])
    expect(parsed.scanKey).toBe('sk-ant-api03-abcdefghijklmnopqrstuv')
    const masked = maskJoinLink(link)
    expect(masked).not.toContain('abcdefghijklmnopqrstuv')
    expect(masked).toContain('a=sk-ant-…stuv')
  })
  it('ignores a value that is not an Anthropic key', () => {
    expect(parseJoinParams('p=paul&a=nope').scanKey).toBeUndefined()
  })
})
