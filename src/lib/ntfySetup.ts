// Phone alerts (ntfy.sh) and the drops calendar: topic handling, the test alert, and the
// subscribe links Settings and the Join page show.
import { NTFY_SERVER, SITE_URL } from './config.ts'

const TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/

/** A topic from whatever was typed or pasted (a bare topic or an ntfy.sh link); '' if it isn't one. */
export function cleanTopic(input: string): string {
  let s = input.trim().replace(/^https?:\/\/(?:www\.)?ntfy\.sh\//i, '').replace(/^ntfy\.sh\//i, '')
  s = s.split(/[/?#]/)[0] ?? ''
  return TOPIC_RE.test(s) ? s : ''
}

/** Anyone who knows a topic can read its alerts, so it should be long enough not to guess. */
export function isValidTopic(topic: string): boolean {
  return TOPIC_RE.test(topic) && topic.length >= 12
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** A fresh random topic like "yungmewtwo-k3j9x2m4q8zt". */
export function generateTopic(randomBytes: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = randomBytes(12)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return `yungmewtwo-${out}`
}

export const topicWebUrl = (topic: string) => `${NTFY_SERVER}/${topic}`

/** Personal topics share a base and end in the person's id ("yungmewtwo-k3j9-alex"); the alert job
 *  sends each person only their own alerts. Given my topic, this is the one for someone else. With
 *  a single shared topic (no id suffix) everyone uses the same one. */
export function topicForPerson(myTopic: string, myId: string | null | undefined, theirId: string): string {
  if (myId && myTopic.endsWith(`-${myId}`)) return `${myTopic.slice(0, -myId.length - 1)}-${theirId}`
  return myTopic
}

export const NTFY_IOS = 'https://apps.apple.com/us/app/ntfy/id1625396347'
export const NTFY_ANDROID = 'https://play.google.com/store/apps/details?id=io.heckel.ntfy'

/** The request for a test alert. Header values stay ASCII: browsers reject anything else. */
export function testAlertRequest(topic: string, name: string): { url: string; init: RequestInit } {
  return {
    url: topicWebUrl(topic),
    init: {
      method: 'POST',
      headers: { Title: 'yungmewtwo test alert', Tags: 'bell' },
      body: `Test from ${name}. If this shows up on your phone, alerts are working.`,
    },
  }
}

export async function sendTestAlert(topic: string, name: string): Promise<void> {
  const { url, init } = testAlertRequest(topic, name)
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new Error("Couldn't reach ntfy.sh. Check your connection and try again.")
  }
  if (!res.ok) throw new Error(`ntfy.sh answered ${res.status}. Check the topic and try again.`)
}

/** webcal:// link to the drops calendar (opens the phone's Calendar app, which then keeps it updated). */
export const calendarWebcalUrl = () => `${SITE_URL.replace(/^https?:/, 'webcal:')}calendar.ics`
export const calendarHttpsUrl = () => `${SITE_URL}calendar.ics`
export const googleCalendarUrl = () => `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calendarWebcalUrl())}`
