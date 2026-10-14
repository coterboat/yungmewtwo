import { describe, expect, it } from 'vitest'
import { calendarWebcalUrl, cleanTopic, generateTopic, googleCalendarUrl, isValidTopic, testAlertRequest, topicWebUrl } from './ntfySetup.ts'

describe('cleanTopic', () => {
  it('accepts letters, digits, dash and underscore', () => {
    expect(cleanTopic(' yungmewtwo-Ab_12 ')).toBe('yungmewtwo-Ab_12')
  })
  it('pulls the topic out of a pasted ntfy link', () => {
    expect(cleanTopic('https://ntfy.sh/yungmewtwo-abc')).toBe('yungmewtwo-abc')
    expect(cleanTopic('ntfy.sh/yungmewtwo-abc/')).toBe('yungmewtwo-abc')
  })
  it('rejects anything else', () => {
    expect(cleanTopic('has spaces')).toBe('')
    expect(cleanTopic('emoji😀')).toBe('')
    expect(cleanTopic('')).toBe('')
    expect(cleanTopic('x'.repeat(65))).toBe('')
  })
})

describe('isValidTopic', () => {
  it('wants something hard to guess', () => {
    expect(isValidTopic('yungmewtwo-k3j9x2m4q8')).toBe(true)
    expect(isValidTopic('pokemon')).toBe(false)
    expect(isValidTopic('')).toBe(false)
  })
})

describe('generateTopic', () => {
  it('makes a prefixed, unguessable-looking topic from random bytes', () => {
    const bytes = Uint8Array.from({ length: 12 }, (_, i) => i * 21)
    const topic = generateTopic((n) => bytes.slice(0, n))
    expect(topic).toMatch(/^yungmewtwo-[a-z0-9]{12}$/)
    expect(isValidTopic(topic)).toBe(true)
  })
  it('differs between calls with different randomness', () => {
    const a = generateTopic((n) => new Uint8Array(n).fill(1))
    const b = generateTopic((n) => new Uint8Array(n).fill(2))
    expect(a).not.toBe(b)
  })
})

describe('urls', () => {
  it('builds the web link for a topic', () => {
    expect(topicWebUrl('yungmewtwo-abc')).toBe('https://ntfy.sh/yungmewtwo-abc')
  })
  it('builds the calendar subscribe links', () => {
    expect(calendarWebcalUrl()).toBe('webcal://coterboat.github.io/yungmewtwo/calendar.ics')
    expect(googleCalendarUrl()).toBe('https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fcoterboat.github.io%2Fyungmewtwo%2Fcalendar.ics')
  })
})

describe('testAlertRequest', () => {
  it('posts a plain-text message with ASCII-only headers', () => {
    const req = testAlertRequest('yungmewtwo-abc', 'Alex')
    expect(req.url).toBe('https://ntfy.sh/yungmewtwo-abc')
    expect(req.init.method).toBe('POST')
    const headers = req.init.headers as Record<string, string>
    expect(headers.Title).toBe('yungmewtwo test alert')
    for (const v of Object.values(headers)) expect(/^[\x20-\x7e]*$/.test(v)).toBe(true)
    expect(req.init.body).toContain('Alex')
  })
})
